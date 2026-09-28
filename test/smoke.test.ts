import assert from "node:assert/strict";
import test from "node:test";
import { applicationName } from "../src/app";

test("identifies the application", () => {
  assert.equal(applicationName, "GREENCODE");
});