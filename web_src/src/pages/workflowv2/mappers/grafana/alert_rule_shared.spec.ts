import { describe, expect, it } from "vitest";

import { buildAlertRuleMetadata, buildGrafanaEventSections } from "./alert_rule_shared";
import type { ExecutionInfo, NodeInfo } from "../types";

function buildNode(overrides?: Partial<NodeInfo>): NodeInfo {
  return {
    id: "node-1",
    name: "Alert Rule",
    componentName: "grafana.updateAlertRule",
    isCollapsed: false,
    configuration: {},
    metadata: {},
    ...overrides,
  };
}

describe("buildGrafanaEventSections", () => {
  it("non-strict mode still emits a section when root event is missing (relaxed)", () => {
    const nodes: NodeInfo[] = [
      {
        id: "trigger-node",
        name: "Trigger",
        componentName: "grafana.onAlertFiring",
        isCollapsed: false,
      },
    ];
    const execution: ExecutionInfo = {
      id: "exec-1",
      createdAt: "2025-01-01T12:00:00.000Z",
      updatedAt: "2025-01-01T12:00:00.000Z",
      state: "STATE_FINISHED",
      result: "RESULT_PASSED",
      resultReason: "RESULT_REASON_OK",
      resultMessage: "",
      metadata: {},
      configuration: {},
      rootEvent: undefined,
    };

    const sections = buildGrafanaEventSections(nodes, execution, "grafana.createAlertRule", { strict: false });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.eventId).toBe("");
  });

  it("strict mode prefers root event createdAt for display timestamps", () => {
    const nodes: NodeInfo[] = [
      {
        id: "trigger-node",
        name: "Trigger",
        componentName: "grafana.onAlertFiring",
        isCollapsed: false,
      },
    ];
    const execution: ExecutionInfo = {
      id: "exec-1",
      createdAt: "2025-01-01T12:00:00.000Z",
      updatedAt: "2025-01-01T13:00:00.000Z",
      state: "STATE_FINISHED",
      result: "RESULT_PASSED",
      resultReason: "RESULT_REASON_OK",
      resultMessage: "",
      metadata: {},
      configuration: {},
      rootEvent: {
        id: "evt-1",
        createdAt: "2025-01-01T11:00:00.000Z",
        nodeId: "trigger-node",
        data: {},
        type: "grafana.onAlertFiring",
      },
    };

    const sections = buildGrafanaEventSections(nodes, execution, "grafana.createAlertRule", { strict: true });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.receivedAt?.toISOString()).toBe("2025-01-01T11:00:00.000Z");
  });

  it("strict mode falls back to execution updatedAt when root event has no createdAt", () => {
    const nodes: NodeInfo[] = [
      {
        id: "trigger-node",
        name: "Trigger",
        componentName: "grafana.onAlertFiring",
        isCollapsed: false,
      },
    ];
    const execution: ExecutionInfo = {
      id: "exec-1",
      createdAt: "2025-01-01T12:00:00.000Z",
      updatedAt: "2025-01-01T13:00:00.000Z",
      state: "STATE_FINISHED",
      result: "RESULT_PASSED",
      resultReason: "RESULT_REASON_OK",
      resultMessage: "",
      metadata: {},
      configuration: {},
      rootEvent: {
        id: "evt-1",
        createdAt: "",
        nodeId: "trigger-node",
        data: {},
        type: "grafana.onAlertFiring",
      },
    };

    const sections = buildGrafanaEventSections(nodes, execution, "grafana.createAlertRule", { strict: true });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.receivedAt?.toISOString()).toBe("2025-01-01T13:00:00.000Z");
  });
});

describe("buildAlertRuleMetadata", () => {
  it("ignores empty configuration titles and falls back to alertRule", () => {
    const metadata = buildAlertRuleMetadata(
      buildNode({
        configuration: {
          title: "",
          alertRule: "rule-123",
        },
      }),
      { includeUid: true },
    );

    expect(metadata).toEqual([expect.objectContaining({ icon: "hash", label: "rule-123" })]);
  });

  it("trims whitespace titles before rendering metadata", () => {
    const metadata = buildAlertRuleMetadata(
      buildNode({
        configuration: {
          title: "  Production Alert  ",
        },
      }),
    );

    expect(metadata).toEqual([expect.objectContaining({ icon: "bell", label: "Production Alert" })]);
  });
});
