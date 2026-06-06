import { NavLink } from "react-router-dom";
import { SECONDARY } from "../nav";
import { Section } from "../components/ui";

export default function More() {
  return (
    <Section title="All Modules">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {SECONDARY.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path}
            className="card p-4 flex flex-col items-center gap-2.5 cursor-pointer hover:border-brand/50 hover:shadow-glow transition-all duration-200">
            <Icon size={24} className="text-brand" />
            <span className="text-xs text-txt text-center">{label}</span>
          </NavLink>
        ))}
      </div>
    </Section>
  );
}
