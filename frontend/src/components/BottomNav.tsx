import { NavLink, useLocation } from "react-router-dom";
import { PRIMARY, SECONDARY } from "../nav";

export default function BottomNav() {
  const { pathname } = useLocation();
  const onSecondary = SECONDARY.some((s) => s.path === pathname);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-base/90 backdrop-blur-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto max-w-3xl grid grid-cols-5">
        {PRIMARY.map(({ path, label, icon: Icon }) => {
          const active = path === pathname || (path === "/more" && onSecondary);
          return (
            <NavLink
              key={path}
              to={path}
              className="flex flex-col items-center justify-center gap-1 py-2.5 cursor-pointer select-none transition-colors"
              aria-label={label}
            >
              <Icon
                size={21}
                strokeWidth={active ? 2.4 : 1.8}
                className={active ? "text-brand" : "text-faint"}
                style={active ? { filter: "drop-shadow(0 0 6px rgba(34,211,238,0.6))" } : undefined}
              />
              <span className={`text-[0.58rem] font-medium ${active ? "text-brand" : "text-faint"}`}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
