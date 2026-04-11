import Link from "next/link";

const LINKS = [
  { href: "/", label: "메인" },
  { href: "/admin", label: "관리자" },
  { href: "/login", label: "로그인" },
  { href: "/profile", label: "프로필" },
  { href: "/settlements", label: "정산" },
] as const;

export function DevNav() {
  return (
    <nav
      aria-label="개발용 빠른 이동"
      className="flex flex-wrap items-center gap-1 border-b border-neutral-800 bg-black px-3 py-2 text-sm text-white"
    >
      {LINKS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded px-3 py-1.5 text-white transition hover:bg-white/10"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
