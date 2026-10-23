import type { AtsReport, JobDescription, MatchReport, Resume, Suggestion } from "./schemas";

/**
 * A made-up resume, job and match report for "Try a sample", so people can explore every step without uploading
 * anything or using AI credits. Picked to show each feature: an ATS issue, a creative heading to rename, a
 * suggestion with a metric placeholder, one that needs confirmation, and a missing keyword.
 */

export const SAMPLE_FILE_NAME = "Sample resume (Alex Rivera).pdf";

export const sampleResume: Resume = {
  contact: {
    name: "Alex Rivera",
    email: "alex.rivera@example.com",
    phone: "+60 12-345 6789",
    location: "Kuala Lumpur, Malaysia",
    links: ["linkedin.com/in/alex-rivera-example", "github.com/alex-rivera-example"],
  },
  summary: "Data analyst who likes working with data and making reports for the business.",
  sections: [
    {
      id: "s-exp",
      type: "experience",
      title: "Where I've Worked",
      hidden: false,
      items: [
        {
          id: "i-exp1",
          heading: "Data Analyst",
          subheading: "Northwind Retail",
          dates: "Mar 2022 – Present",
          location: "Kuala Lumpur",
          bullets: [
            { id: "b-1", text: "Responsible for the daily sales report in Excel" },
            { id: "b-2", text: "Wrote SQL queries to pull data from the PostgreSQL warehouse for the marketing team" },
            { id: "b-3", text: "Moved the weekly reports from Excel to Power BI dashboards" },
            { id: "b-4", text: "Helped with data cleaning" },
          ],
        },
        {
          id: "i-exp2",
          heading: "Junior Data Analyst",
          subheading: "Contoso Logistics",
          dates: "Jul 2020 – Feb 2022",
          location: "Petaling Jaya",
          bullets: [
            { id: "b-5", text: "Built Python scripts to combine shipment files from three regional systems" },
            { id: "b-6", text: "Created a delivery-time dashboard used by operations managers" },
          ],
        },
      ],
    },
    {
      id: "s-edu",
      type: "education",
      title: "Education",
      hidden: false,
      items: [
        {
          id: "i-edu1",
          heading: "Bachelor of Computer Science",
          subheading: "University of Example",
          dates: "2016 – 2020",
          location: "",
          bullets: [],
        },
      ],
    },
    {
      id: "s-skills",
      type: "skills",
      title: "Skills",
      hidden: false,
      items: [
        { id: "i-sk1", heading: "Languages", subheading: "", dates: "", location: "", bullets: [{ id: "b-s1", text: "SQL" }, { id: "b-s2", text: "Python" }] },
        {
          id: "i-sk2",
          heading: "Tools",
          subheading: "",
          dates: "",
          location: "",
          bullets: [{ id: "b-s3", text: "PostgreSQL" }, { id: "b-s4", text: "Power BI" }, { id: "b-s5", text: "Excel" }],
        },
      ],
    },
  ],
};

export const sampleAts: AtsReport = {
  score: 72,
  summary: "Clean, single-column layout that parses well. A creative section heading and a vague summary hold it back.",
  issues: [
    {
      severity: "medium",
      title: "Non-standard section headings",
      detail: 'Found "Where I\'ve Worked". ATS systems look for common headings.',
      fix: 'Rename it to "Experience".',
    },
    {
      severity: "low",
      title: "Weak summary",
      detail: "The summary doesn't say what kind of analyst you are or what tools you use.",
      fix: "Mention your focus, your main tools and one concrete result.",
    },
  ],
  strengths: ["Contact details are complete and plain text", "Dates are consistent", "Bullets start with action verbs in most places"],
};

export const sampleJob: JobDescription = {
  title: "Data Engineer",
  company: "Example Bank",
  seniority: "Mid-level",
  requiredSkills: ["SQL", "Python", "ETL pipelines", "Airflow", "PostgreSQL"],
  niceToHaveSkills: ["dbt", "Cloud data warehouse"],
  responsibilities: [
    "Build and maintain batch ETL pipelines",
    "Model data in the warehouse for analytics",
    "Monitor data quality and fix pipeline issues",
  ],
  keywords: ["ETL", "data pipelines", "Airflow", "SQL", "Python", "data quality", "data modelling", "PostgreSQL"],
  summary: "Mid-level data engineer to build batch pipelines and warehouse models for the analytics team.",
};

const suggestion = (s: Partial<Suggestion> & Pick<Suggestion, "id" | "kind" | "target" | "original" | "proposed" | "reason">): Suggestion => ({
  sectionId: "",
  itemId: "",
  bulletId: "",
  needsUserConfirmation: false,
  metricHints: [],
  ...s,
});

export const sampleReport: MatchReport = {
  score: 58,
  breakdown: { keywordCoverage: 50, experienceRelevance: 66, seniorityFit: 60 },
  summary:
    "Solid SQL and Python foundations with real pipeline-like work (combining files from three systems), but the resume reads as reporting rather than engineering, and Airflow and data quality aren't shown.",
  matchedKeywords: ["SQL", "Python", "PostgreSQL"],
  missingKeywords: [
    { keyword: "ETL", truthfullyAddable: true, note: "Combining shipment files from three systems is ETL work; name it." },
    { keyword: "data quality", truthfullyAddable: true, note: "Data cleaning is data-quality work; describe what you checked." },
    { keyword: "Airflow", truthfullyAddable: false, note: "No evidence yet. Only add it if you've used it." },
  ],
  suggestions: [
    suggestion({
      id: "sg-summary",
      kind: "rewrite",
      target: "summary",
      original: sampleResume.summary,
      proposed:
        "Data analyst moving into data engineering, with 4+ years of SQL and Python, building ETL scripts and warehouse queries on PostgreSQL and the dashboards that run on them.",
      reason: "Leads with the direction you're heading and the job's core keywords, using only what the resume already shows.",
    }),
    suggestion({
      id: "sg-heading",
      kind: "rewrite",
      target: "section",
      sectionId: "s-exp",
      original: "Where I've Worked",
      proposed: "Experience",
      reason: "ATS systems look for standard headings.",
    }),
    suggestion({
      id: "sg-b5",
      kind: "rewrite",
      target: "bullet",
      sectionId: "s-exp",
      itemId: "i-exp2",
      bulletId: "b-5",
      original: "Built Python scripts to combine shipment files from three regional systems",
      proposed: "Built Python ETL scripts that merged shipment data from three regional systems into one daily dataset",
      reason: 'Names the work as ETL, the job\'s top keyword, without claiming anything new.',
    }),
    suggestion({
      id: "sg-b1",
      kind: "rewrite",
      target: "bullet",
      sectionId: "s-exp",
      itemId: "i-exp1",
      bulletId: "b-1",
      original: "Responsible for the daily sales report in Excel",
      proposed: "Automated the daily sales report, cutting preparation time by [time saved per day]",
      reason: "Shows impact instead of duty. Only keep the number if it's true.",
      metricHints: [
        {
          placeholder: "[time saved per day]",
          question: "Roughly how long did the report take before, and how long after?",
          howToFind: "Think about a typical morning before and after the change; old calendar blocks or messages can help.",
          typicalRange: "15–60 minutes a day",
          examples: ["20 minutes", "30 minutes", "45 minutes"],
          noNumberVersion: "Automated the daily sales report so it no longer needed manual preparation each morning",
        },
      ],
    }),
    suggestion({
      id: "sg-b4",
      kind: "rewrite",
      target: "bullet",
      sectionId: "s-exp",
      itemId: "i-exp1",
      bulletId: "b-4",
      original: "Helped with data cleaning",
      proposed: "Added data-quality checks for missing and duplicate sales records before reports were published",
      reason: "Turns a vague task into data-quality work. Confirm this matches what you actually did.",
      needsUserConfirmation: true,
    }),
  ],
  suggestedSectionOrder: ["s-exp", "s-skills", "s-edu"],
};
