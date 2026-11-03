import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HOSTS } from "@podframes/core";
import { defaultChannel } from "../components/studio/host-channel";
import { defaultCast, castFromHosts } from "../components/studio/wizard/cast";
import { providerById } from "./providers";

test("new core and Studio hosts default to Fish Drama 3", () => {
  assert.ok(DEFAULT_HOSTS.every((host) => host.model === "fish/drama-3"));
  assert.ok(defaultCast().every((host) => host.model === "fish/drama-3"));
  assert.equal(defaultChannel("host_a", "left", "Jason", "fish", "").model, "fish/drama-3");
  assert.ok(providerById("fish")?.models?.some((model) => model.id === "fish/s2.1-pro"));
  const saved = DEFAULT_HOSTS.map((host) => ({ ...host, model: "fish/s2.1-pro" }));
  assert.ok(castFromHosts(saved).every((host) => host.model === "fish/s2.1-pro"));
});
