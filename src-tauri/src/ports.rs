//! Port explorer — enumerate TCP listening sockets, resolve owning process,
//! kill on demand. Useful for cleaning up zombie dev servers left from
//! crashed runs (port 1420, 3000, 5173, etc).

use netstat2::{
    get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, TcpState,
};
use serde::Serialize;
use std::process::Stdio;
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

/// Enumerate every TCP socket currently in LISTEN state and resolve its
/// owning process (name + command line) via sysinfo.
pub fn list_listening(owned_pids: &[u32]) -> anyhow::Result<Vec<PortEntry>> {
    let af = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto = ProtocolFlags::TCP;
    let sockets = get_sockets_info(af, proto)?;

    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::new()),
    );
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::new(),
    );

    let mut entries: Vec<PortEntry> = Vec::new();
    for s in sockets {
        let ProtocolSocketInfo::Tcp(tcp) = &s.protocol_socket_info else {
            continue;
        };
        if tcp.state != TcpState::Listen {
            continue;
        }
        let pid = s.associated_pids.first().copied();
        let (process_name, cmd_line) = match pid
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
        let owned = pid
            .map(|p| owned_pids.contains(&p))
            .unwrap_or(false);
        entries.push(PortEntry {
            port: tcp.local_port,
            addr: tcp.local_addr.to_string(),
            protocol: "tcp".into(),
            pid,
            process_name,
            cmd_line,
            owned,
        });
    }

    // Sort by port ascending so the UI is predictable.
    entries.sort_by(|a, b| a.port.cmp(&b.port).then(a.addr.cmp(&b.addr)));
    Ok(entries)
}

/// Force-kill a process tree. Mirrors the runner's kill_tree behaviour so
/// child processes (vite spawning esbuild, npm spawning node, etc) all die.
pub fn kill_pid(pid: u32) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        let status = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
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
