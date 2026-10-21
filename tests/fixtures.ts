import type { Resume, Suggestion } from "@/lib/schemas";

export const sampleResume = (): Resume => ({
  contact: { name: "Alex Doe", email: "alex@example.com", phone: "555-0100", location: "Remote", links: [] },
  summary: "Engineer.",
  sections: [
    {
      id: "exp",
      type: "experience",
      title: "Experience",
      hidden: false,
      items: [
        {
          id: "job1",
          heading: "Software Engineer",
          subheading: "Acme",
          dates: "Jan 2021 – Present",
          location: "Remote",
          bullets: [
            { id: "b1", text: "Built things" },
            { id: "b2", text: "Fixed bugs" },
          ],
        },
      ],
    },
    {
      id: "skills",
      type: "skills",
      title: "Skills",
      hidden: false,
      items: [{ id: "sk1", heading: "Languages", subheading: "", dates: "", location: "", bullets: [{ id: "s1", text: "TypeScript" }] }],
    },
  ],
});

export const sug = (p: Partial<Suggestion>): Suggestion => ({
  id: "x",
  kind: "rewrite",
  target: "bullet",
  sectionId: "",
  itemId: "",
  bulletId: "",
  original: "",
  proposed: "",
  reason: "",
  needsUserConfirmation: false,
  metricHints: [],
  ...p,
});
