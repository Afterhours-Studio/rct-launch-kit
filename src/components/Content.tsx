import { useView } from "../stores/view";
import { ProjectView } from "./ProjectView";
import { SettingsView } from "./SettingsView";
import { ForgeView } from "./ForgeView";
import "./content.css";

export function Content() {
  const view = useView((s) => s.view);
  return (
    <section className="content">
      {view === "settings" ? (
        <SettingsView />
      ) : view === "forge" ? (
        <ForgeView />
      ) : (
        <ProjectView />
      )}
    </section>
  );
}
