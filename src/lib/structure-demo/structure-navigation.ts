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
      ["RegisterCollection", "register-collection"],
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
    ],
  },
  ...(["sequences", "coordination", "transforms"] as const).map((family) => ({
    title: remainingFamilies[family].name,
    href: `/structures/${family}/`,
    summary: {
      sequences: "Keep lists and text in order while several people edit them.",
      coordination: "Choose one owner, worker, assignee, or accepted value.",
      transforms: "Keep JSON and formatted text changes when they happen at the same time.",
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

export function structureNextLinks(path: string) {
  const location = structureLocation(path);
  if (path.replace(/\/$/, "") === "/structures/models") {
    return [
      { href: "/structures/", label: "Browse structure families" },
      { href: structureGroups[0].href, label: `Start with ${structureGroups[0].title.toLowerCase()}` },
    ];
  }
  if (!location || !("group" in location) || !location.group) {
    throw new Error(`No structure navigation for ${path}`);
  }
  const { group, index } = location;
  const previousGroup = structureGroups[index - 1];
  const nextGroup = structureGroups[index + 1];
  if (!("lessonIndex" in location)) {
    return [
      ...(previousGroup ? [{ href: previousGroup.href, label: `Back to ${previousGroup.title}` }] : []),
      { href: "/structures/", label: "Browse all structure families" },
      { href: `/structures/${group.lessons[0][1]}/`, label: `Start the ${group.title.toLowerCase()} lessons` },
      ...(nextGroup ? [{ href: nextGroup.href, label: `Continue to ${nextGroup.title}` }] : []),
    ];
  }
  const lessonIndex = location.lessonIndex;
  if (lessonIndex === undefined) throw new Error(`Missing lesson position for ${path}`);
  const previous = group.lessons[lessonIndex - 1];
  const next = group.lessons[lessonIndex + 1];
  return [
    ...(previous ? [{ href: `/structures/${previous[1]}/`, label: `Back to ${previous[0]}` }] : []),
    { href: group.href, label: `Browse ${group.title.toLowerCase()} family` },
    ...(next
      ? [{ href: `/structures/${next[1]}/`, label: `Continue to ${next[0]}` }]
      : nextGroup
        ? [{ href: nextGroup.href, label: `Continue to ${nextGroup.title}` }]
        : [{ href: "/structures/", label: "Return to structures" }]),
  ];
}
