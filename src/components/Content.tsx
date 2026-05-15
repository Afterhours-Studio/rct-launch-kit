import { useView } from "../stores/view";
import { ProjectView } from "./ProjectView";
import { SettingsView } from "./SettingsView";
import "./content.css";

export function Content() {
  const view = useView((s) => s.view);
  return (
    <section className="content">
      {view === "settings" ? (
        <SettingsView />
      ) : view === "forge" ? (
        <ForgePlaceholder />
      ) : (
        <ProjectView />
      )}
    </section>
  );
}

function ForgePlaceholder() {
  return (
    <div className="content-placeholder">
      <div className="content-placeholder__inner">
        <div className="content-placeholder__title">Forge</div>
        <p className="content-placeholder__text">
          Reusable command templates and snippets
        </p>
        <p className="content-placeholder__text">
          (coming soon)
        </p>
      </div>
    </div>
  );
}
