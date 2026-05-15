//! Port explorer — enumerate TCP listening sockets, resolve owning process,
//! kill on demand. Useful for cleaning up zombie dev servers left from
//! crashed runs (port 1420, 3000, 5173, etc).

use serde::Serialize;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

#[derive(Serialize, Clone)]
pub struct PortEntry {
    pub port: u16,
    pub addr: String,
    pub protocol: String,
    pub pid: Option<u32>,
    #[serde(rename = "processName")]
    pub process_name: Option<String>,
    #[serde(rename = "cmdLine")]
    pub cmd_line: Option<String>,
    /// True if this PID was spawned by our own launcher.
    pub owned: bool,
}

/// Listening socket without process info — produced by the platform-specific
/// enumerator and enriched with PID/process metadata in the shared layer.
struct RawListener {
    port: u16,
    addr: String,
    pid: Option<u32>,
}

/// Enumerate every TCP socket currently in LISTEN state and resolve its
/// owning process (name + command line) via sysinfo.
pub fn list_listening(owned_pids: &[u32]) -> anyhow::Result<Vec<PortEntry>> {
    let raw = enumerate_listeners()?;

    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::new()),
    );
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::new(),
    );

    let mut entries: Vec<PortEntry> = Vec::with_capacity(raw.len());
    for r in raw {
        let (process_name, cmd_line) = match r
            .pid
            .and_then(|p| sys.process(sysinfo::Pid::from_u32(p)))
        {
            Some(proc) => {
                let name = proc.name().to_string_lossy().into_owned();
                let cmd = proc
                    .cmd()
                    .iter()
                    .map(|c| c.to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join(" ");
                let cmd = if cmd.is_empty() { None } else { Some(cmd) };
                (Some(name), cmd)
            }
            None => (None, None),
        };
        let owned = r.pid.map(|p| owned_pids.contains(&p)).unwrap_or(false);
        entries.push(PortEntry {
            port: r.port,
            addr: r.addr,
            protocol: "tcp".into(),
            pid: r.pid,
            process_name,
            cmd_line,
            owned,
        });
    }

    entries.sort_by(|a, b| a.port.cmp(&b.port).then(a.addr.cmp(&b.addr)));
    Ok(entries)
}

// ---------- Platform-specific enumeration ----------

#[cfg(not(target_os = "linux"))]
fn enumerate_listeners() -> anyhow::Result<Vec<RawListener>> {
    use netstat2::{
        get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, TcpState,
    };

    let af = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let sockets = get_sockets_info(af, ProtocolFlags::TCP)?;

    let mut out = Vec::new();
    for s in sockets {
        let ProtocolSocketInfo::Tcp(tcp) = &s.protocol_socket_info else {
            continue;
        };
        if tcp.state != TcpState::Listen {
            continue;
        }
        out.push(RawListener {
            port: tcp.local_port,
            addr: tcp.local_addr.to_string(),
            pid: s.associated_pids.first().copied(),
        });
    }
    Ok(out)
}

#[cfg(target_os = "linux")]
fn enumerate_listeners() -> anyhow::Result<Vec<RawListener>> {
    use procfs::net::TcpState;
    use procfs::process::FDTarget;
    use std::collections::HashMap;

    // Build inode → pid map by walking /proc/<pid>/fd. We do this once and
    // share it across IPv4 + IPv6 lookups. Permission errors on individual
    // PIDs are normal (can't read other users' fds without root) — skip them.
    let mut inode_to_pid: HashMap<u64, u32> = HashMap::new();
    if let Ok(procs) = procfs::process::all_processes() {
        for p in procs.flatten() {
            let pid = p.pid as u32;
            let Ok(fds) = p.fd() else { continue };
            for fd in fds.flatten() {
                if let FDTarget::Socket(inode) = fd.target {
                    inode_to_pid.entry(inode).or_insert(pid);
                }
            }
        }
    }

    let mut out = Vec::new();
    for entry in procfs::net::tcp().unwrap_or_default() {
        if entry.state != TcpState::Listen {
            continue;
        }
        out.push(RawListener {
            port: entry.local_address.port(),
            addr: entry.local_address.ip().to_string(),
            pid: inode_to_pid.get(&entry.inode).copied(),
        });
    }
    for entry in procfs::net::tcp6().unwrap_or_default() {
        if entry.state != TcpState::Listen {
            continue;
        }
        out.push(RawListener {
            port: entry.local_address.port(),
            addr: entry.local_address.ip().to_string(),
            pid: inode_to_pid.get(&entry.inode).copied(),
        });
    }
    Ok(out)
}

/// Force-kill a process tree. Mirrors the runner's kill_tree behaviour so
/// child processes (vite spawning esbuild, npm spawning node, etc) all die.
pub fn kill_pid(pid: u32) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Stdio;
        let status = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?;
        if !status.success() {
            anyhow::bail!("taskkill exit code {:?}", status.code());
        }
    }
    #[cfg(unix)]
    {
        let neg = format!("-{}", pid);
        let _ = std::process::Command::new("kill")
            .args(["--", &neg])
            .status();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let _ = std::process::Command::new("kill")
            .args(["-9", "--", &neg])
            .status();
    }
    Ok(())
}
