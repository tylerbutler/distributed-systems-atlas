import { remainingFamilies, structuresForFamily } from "./remaining-structures";

type StructureGroup = {
  title: string;
  href: string;
  summary: string;
  lessons: [name: string, slug: string][];
};

export const structureGroups: StructureGroup[] = [
  {
    title: "Counters",
    href: "/structures/counters/",
    summary: "Count up, count down, or put every change in one shared order.",
    lessons: [
      ["G-counter", "g-counter"],
      ["PN-counter", "pn-counter"],
      ["SharedCounter", "shared-counter"],
    ],
  },
  {
    title: "Sets",
    href: "/structures/sets/",
    summary: "Choose whether items stay forever, leave forever, or can return.",
    lessons: [
      ["GSet", "g-set"],
      ["TwoPSet", "two-p-set"],
      ["Observed-remove set", "observed-remove-set"],
    ],
  },
  {
    title: "Registers",
    href: "/structures/registers/",
    summary: "Choose one answer or keep several answers until someone resolves them.",
    lessons: [
      ["LWWRegister", "lww-register"],
      ["MvRegister", "multi-value-register"],
      ["RegisterMap", "register-map"],
    ],
  },
  {
    title: "Maps",
    href: "/structures/maps/",
    summary: "Store named values and decide what happens when people change the same one.",
    lessons: [
      ["SharedMap", "shared-map"],
      ["LWWMap", "lww-map"],
      ["OR-map", "or-map"],
      ["SharedDirectory", "shared-directory"],
      ["JsonOt", "json-ot"],
    ],
  },
  ...(["sequences", "coordination"] as const).map((family) => ({
    title: remainingFamilies[family].name,
    href: `/structures/${family}/`,
    summary: {
      sequences: "Keep lists and text in order while several people edit them.",
      coordination: "Choose one owner, worker, assignee, or accepted value.",
    }[family],
    lessons: structuresForFamily(family).map(({ name, id }): [string, string] => [name, id]),
  })),
];

export function structureGroup(slug: string): StructureGroup {
  const group = structureGroups.find(({ href }) => href === `/structures/${slug}/`);
  if (!group) throw new Error(`Unknown structure family: ${slug}`);
  return group;
}

export function structureLocation(path: string) {
  const slug = path.match(/^\/structures\/([^/]+)\/?$/)?.[1];
  if (!slug) return undefined;
  if (slug === "models") return { title: "CRDT, DDS, and JSON-OT" };
  for (const [index, group] of structureGroups.entries()) {
    if (group.href === `/structures/${slug}/`) return { group, index };
    const lessonIndex = group.lessons.findIndex(([, id]) => id === slug);
    if (lessonIndex >= 0) return { group, index, lessonIndex, title: group.lessons[lessonIndex][0] };
  }
  throw new Error(`Unknown structure route: ${path}`);
}

export function structureBrowseLinks(path: string) {
  const location = structureLocation(path);
  if (path.replace(/\/$/, "") === "/structures/models") {
    return [
      { href: "/structures/", label: "Browse structure families" },
    ];
  }
  if (!location || !("group" in location) || !location.group) {
    throw new Error(`No structure navigation for ${path}`);
  }
  const { group } = location;
  if (!("lessonIndex" in location)) {
    return [
      { href: "/structures/", label: "Browse all structure families" },
    ];
  }
  return [
    { href: group.href, label: `Browse ${group.title.toLowerCase()} family` },
    { href: "/structures/", label: "Browse all structure families" },
  ];
}
