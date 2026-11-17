// Kept free of Node imports: the prompt registry and the web build read it.
export type PremergeFinding = {
  severity: "defect" | "minor";
  file: string;
  line: number;
  title: string;
  scenario: string;
  fix?: { file: string; change: string };
};
