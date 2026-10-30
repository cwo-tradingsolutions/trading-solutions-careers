import assert from "node:assert/strict";
import { test } from "node:test";
import { batteryAutoSendEnabled, NOTA_BATERIA_PENDIENTE } from "./battery-auto-send";

test("battery auto-send stays off unless BATTERY_AUTO_SEND_ENABLED is explicitly on", () => {
  assert.equal(batteryAutoSendEnabled(undefined), false);
  assert.equal(batteryAutoSendEnabled(""), false);
  assert.equal(batteryAutoSendEnabled("0"), false);
  assert.equal(batteryAutoSendEnabled("false"), false);
  assert.equal(batteryAutoSendEnabled("1"), true);
  assert.equal(batteryAutoSendEnabled("true"), true);
  assert.equal(NOTA_BATERIA_PENDIENTE, "batería pendiente de envío");
});
