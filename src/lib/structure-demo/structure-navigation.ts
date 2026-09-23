import { remainingFamilies, structuresForFamily } from "./remaining-structures";

type StructureGroup = {
  title: string;
  href: string;
  lessons: [name: string, slug: string][];
};

export const structureGroups: StructureGroup[] = [
  {
    title: "Counters",
    href: "/structures/counters/",
    lessons: [
      ["G-counter", "g-counter"],
      ["PN-counter", "pn-counter"],
      ["SharedCounter", "shared-counter"],
    ],
  },
  {
    title: "Sets",
    href: "/structures/sets/",
    lessons: [
      ["GSet", "g-set"],
      ["TwoPSet", "two-p-set"],
      ["Observed-remove set", "observed-remove-set"],
    ],
  },
  {
    title: "Registers",
    href: "/structures/registers/",
    lessons: [
      ["LWWRegister", "lww-register"],
      ["MvRegister", "multi-value-register"],
      ["RegisterCollection", "register-collection"],
    ],
  },
  {
    title: "Maps",
    href: "/structures/maps/",
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
    lessons: structuresForFamily(family).map(({ name, id }): [string, string] => [name, id]),
  })),
];
