// Validation of GraphQL documents against GitHub's public schema (test/fixtures/github-schema.graphql;
// refresh with `pnpm gql-schema`). Variables are not checked.
import { readFileSync } from "node:fs";
import { buildSchema, GraphQLError, OverlappingFieldsCanBeMergedRule, parse, specifiedRules, validate, type GraphQLSchema } from "graphql";
import type { Querier } from "../src/mirror.ts";

let schema: GraphQLSchema | null = null;

// GitHub accepts `state` selected in both `... on Issue` and `... on PullRequest` (different enum types),
// which this rule rejects; the mirror's production queries rely on it.
const rules = specifiedRules.filter((r) => r !== OverlappingFieldsCanBeMergedRule);

function getSchema(): GraphQLSchema {
  // graphql 17 rejects GitHub's schema for deprecating an implementing field whose interface field is not
  // deprecated; deprecation does not affect validity of queries, so the directive is dropped.
  const sdl = readFileSync(new URL("./fixtures/github-schema.graphql", import.meta.url), "utf8")
    .replace(/@deprecated\(\s*reason:\s*(?:"(?:[^"\\\n]|\\.)*"|"""[\s\S]*?""")\s*\)/g, "");
  schema = buildSchema(sdl, { assumeValidSDL: true });
  return schema;
}

const describe = (e: GraphQLError) => {
  const at = e.locations?.[0];
  return `${at ? `line ${at.line}:${at.column}: ` : ""}${e.message}`;
};

/** Throws when the document does not parse or is invalid against GitHub's schema. */
export function assertValidGql(query: string): void {
  let doc;
  try {
    doc = parse(query);
  } catch (e) {
    throw new Error(`GraphQL syntax error: ${describe(e as GraphQLError)}\n${query}`);
  }
  const errors = validate(getSchema(), doc, rules);
  if (errors.length) throw new Error(`Invalid GraphQL against GitHub's schema:\n${errors.map(describe).join("\n")}\n${query}`);
}

/** Number of documents validated through `validating` in this process. */
export const gqlChecked = { count: 0 };

/** Makes a fake Querier validate every document it receives before answering. Returns the same object. */
export function validating<T extends Pick<Querier, "query">>(fake: T): T {
  const inner = fake.query.bind(fake);
  fake.query = ((query: string, variables: object) => {
    assertValidGql(query);
    gqlChecked.count++;
    return inner(query, variables);
  }) as T["query"];
  return fake;
}
