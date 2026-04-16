import type { EventSection } from "@/ui/componentBase";
import type { MetadataItem } from "@/ui/metadataList";
import { renderTimeAgo } from "@/components/TimeAgo";
import { getState, getTriggerRenderer } from "..";
import type { ExecutionDetailsContext, ExecutionInfo, NodeInfo, OutputPayload } from "../types";
import { formatTimestamp } from "../utils";
import type {
  AlertRuleNodeMetadata,
  CreateAlertRuleConfiguration,
  GrafanaAlertRule,
  UpdateAlertRuleConfiguration,
} from "./types";

export type BuildGrafanaEventSectionsOptions = {
  /**
   * When true (default), require a valid root trigger event and node; otherwise return no sections.
   * When false, use the same relaxed rules as `baseEventSections` (e.g. missing root event id).
   */
  strict?: boolean;
};

function resolveGrafanaEventDisplayTimestamp(execution: ExecutionInfo): string | undefined {
  const rootCreated = execution.rootEvent?.createdAt;
  if (typeof rootCreated === "string" && rootCreated.trim() !== "") {
    return rootCreated;
  }
  if (typeof execution.updatedAt === "string" && execution.updatedAt.trim() !== "") {
    return execution.updatedAt;
  }
  return execution.createdAt;
}

function buildRelaxedGrafanaEventSections(
  nodes: NodeInfo[],
  execution: ExecutionInfo,
  componentName: string,
): EventSection[] {
  const rootTriggerNode = nodes.find((n) => n.id === execution.rootEvent?.nodeId);
  const rootTriggerRenderer = getTriggerRenderer(rootTriggerNode?.componentName || "");
  const { title } = rootTriggerRenderer.getTitleAndSubtitle({ event: execution.rootEvent });
  const eventTitle = title || "Trigger event";

  return [
    {
      receivedAt: execution.createdAt ? new Date(execution.createdAt) : undefined,
      eventTitle: eventTitle,
      eventSubtitle: execution.createdAt ? renderTimeAgo(new Date(execution.createdAt)) : "-",
      eventState: getState(componentName)(execution),
      eventId: execution.rootEvent?.id || "",
    },
  ];
}

function buildStrictGrafanaEventSections(
  nodes: NodeInfo[],
  execution: ExecutionInfo,
  componentName: string,
): EventSection[] {
  if (!execution.rootEvent?.id || !execution.createdAt) {
    return [];
  }

  const rootTriggerNode = nodes.find((node) => node.id === execution.rootEvent?.nodeId);
  if (!rootTriggerNode?.componentName) {
    return [];
  }

  const displayTime = resolveGrafanaEventDisplayTimestamp(execution) ?? execution.createdAt;

  const rootTriggerRenderer = getTriggerRenderer(rootTriggerNode.componentName);
  const { title } = rootTriggerRenderer.getTitleAndSubtitle({ event: execution.rootEvent });

  return [
    {
      receivedAt: new Date(displayTime),
      eventTitle: title || "Trigger event",
      eventSubtitle: renderTimeAgo(new Date(displayTime)),
      eventState: getState(componentName)(execution),
      eventId: execution.rootEvent.id,
    },
  ];
}

export function buildAlertRuleMetadata(
  node: NodeInfo,
  options?: {
    includeUid?: boolean;
    includeGroup?: boolean;
    includePausedState?: boolean;
  },
): MetadataItem[] {
  const configuration = node.configuration as
    | (CreateAlertRuleConfiguration & { alertRule?: string })
    | UpdateAlertRuleConfiguration
    | undefined;
  const nodeMetadata = node.metadata as AlertRuleNodeMetadata | undefined;

  const primaryItem =
    buildAlertRuleTitleItem(configuration?.title) ||
    buildAlertRuleTitleItem(nodeMetadata?.alertRuleTitle) ||
    buildAlertRuleUidItem(configuration?.alertRule, options?.includeUid);

  return [
    primaryItem,
    nodeMetadata?.folderTitle ? { icon: "folder", label: nodeMetadata.folderTitle } : undefined,
    buildPausedStateItem(configuration?.isPaused, options?.includePausedState),
    configuration?.ruleGroup && options?.includeGroup
      ? { icon: "layers-3", label: configuration.ruleGroup }
      : undefined,
  ]
    .filter(isMetadataItem)
    .slice(0, 3);
}

export function buildAlertRuleExecutionDetails(
  context: ExecutionDetailsContext,
  actionLabel: string,
): Record<string, string> {
  const outputs = context.execution.outputs as { default?: OutputPayload[] } | undefined;

  if (!outputs?.default?.length) {
    return { Response: "No data returned" };
  }

  const payload = outputs.default[0];
  const alertRule = asAlertRule(payload?.data);
  if (!alertRule) {
    return { Response: "No data returned" };
  }
  const nodeMetadata = context.node.metadata as AlertRuleNodeMetadata | undefined;

  const details: Record<string, string> = {
    [actionLabel]: formatTimestamp(payload?.timestamp ?? context.execution.createdAt),
  };

  addOptionalDetail(details, "Title", alertRule.title);
  addOptionalDetail(details, "Folder", alertRule.folderTitle || nodeMetadata?.folderTitle);
  addOptionalDetail(details, "Rule Group", alertRule.ruleGroup);
  addOptionalDetail(details, "For", alertRule.for);
  addOptionalDetail(details, "Paused", formatPausedState(alertRule.isPaused));

  return details;
}

export function buildGrafanaEventSections(
  nodes: NodeInfo[],
  execution: ExecutionInfo,
  componentName: string,
  options?: BuildGrafanaEventSectionsOptions,
): EventSection[] {
  const strictMode = options?.strict !== false;
  if (!strictMode) {
    return buildRelaxedGrafanaEventSections(nodes, execution, componentName);
  }
  return buildStrictGrafanaEventSections(nodes, execution, componentName);
}

export function asAlertRule(value: unknown): GrafanaAlertRule | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return {
    uid: asString(record.uid),
    title: asString(record.title),
    folderUID: asString(record.folderUID),
    folderTitle: asString(record.folderTitle),
    ruleGroup: asString(record.ruleGroup),
    condition: asString(record.condition),
    noDataState: asString(record.noDataState),
    execErrState: asString(record.execErrState),
    for: asString(record.for),
    isPaused: typeof record.isPaused === "boolean" ? record.isPaused : undefined,
    labels: asStringRecord(record.labels),
    annotations: asStringRecord(record.annotations),
    data: Array.isArray(record.data) ? record.data.filter(isRecord) : undefined,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record)
    .filter(([, entryValue]) => typeof entryValue === "string")
    .map(([key, entryValue]) => [key, entryValue as string]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function addOptionalDetail(details: Record<string, string>, key: string, value: string | undefined): void {
  if (value) {
    details[key] = value;
  }
}

function buildAlertRuleTitleItem(title: string | undefined): MetadataItem | undefined {
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    return undefined;
  }

  return { icon: "bell", label: trimmedTitle };
}

function buildAlertRuleUidItem(uid: string | undefined, includeUid?: boolean): MetadataItem | undefined {
  if (!uid || !includeUid) {
    return undefined;
  }

  return { icon: "hash", label: uid };
}

function buildPausedStateItem(isPaused: boolean | undefined, includePausedState?: boolean): MetadataItem | undefined {
  if (!includePausedState || isPaused !== true) {
    return undefined;
  }

  return {
    icon: "pause-circle",
    label: "Paused",
  };
}

function formatPausedState(isPaused: boolean | undefined): string | undefined {
  if (isPaused === undefined) {
    return undefined;
  }

  return isPaused ? "Yes" : "No";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isMetadataItem(value: MetadataItem | undefined): value is MetadataItem {
  return value !== undefined;
}
