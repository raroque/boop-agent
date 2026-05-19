import Foundation
import Observation

/// Tracks sub-agents the dispatcher has spawned for the active iOS thread.
///
/// Two responsibilities:
///   1. Keep a list of agents (server-loaded on `bind` / `switchTo`) so the
///      Live Agents sheet has data even when the user opens it cold.
///   2. Mutate that list on the fly when SSE delivers agent_spawned /
///      agent_tool / agent_done — so the chat pill appears the moment a
///      run starts and ticks its tool-count as the agent works.
@MainActor
@Observable
final class AgentsStore {
    private(set) var agents: [AgentRun] = []
    /// agentId → running count of tool_use events streamed since spawn.
    private(set) var toolCounts: [String: Int] = [:]
    /// agentId → full timeline (server-loaded on demand by AgentCard).
    /// Kept here so the bearer + baseURL plumbing stays in one place and
    /// the cards stay free of networking concerns.
    private(set) var logsByAgent: [String: [AgentLog]] = [:]
    /// agentId → in-flight load flag, drives the per-card spinner.
    private(set) var loadingLogsFor: Set<String> = []
    private(set) var loadError: String?

    private let settings: AppSettings
    private var bearer: String?
    private var threadId: String?

    init(settings: AppSettings) { self.settings = settings }

    func bind(bearer: String) { self.bearer = bearer }

    func unbind() {
        bearer = nil
        threadId = nil
        agents.removeAll()
        toolCounts.removeAll()
        logsByAgent.removeAll()
        loadingLogsFor.removeAll()
        loadError = nil
    }

    /// Switch to a new thread. Loads its agent list fresh from the server.
    /// Idempotent — bailing on no-op switches.
    func switchTo(threadId: String) async {
        guard threadId != self.threadId else { return }
        self.threadId = threadId
        agents.removeAll()
        toolCounts.removeAll()
        logsByAgent.removeAll()
        loadingLogsFor.removeAll()
        await reload()
    }

    /// Load (or refresh) the timeline for one agent. Idempotent — multiple
    /// AgentCards mounting at once won't kick off duplicate fetches.
    func loadLogs(for agentId: String) async {
        if loadingLogsFor.contains(agentId) { return }
        guard let bearer, let baseURL = settings.serverBaseURL else { return }
        loadingLogsFor.insert(agentId)
        defer { loadingLogsFor.remove(agentId) }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.fetchAgentLogs(agentId: agentId, limit: 300)
            logsByAgent[agentId] = response.logs
        } catch {
            // Capture the error so AgentCard can show something — silent
            // failures here would look identical to "no tool calls".
            loadError = "Couldn't load logs: \(error.localizedDescription)"
        }
    }

    /// Re-fetch the agent list for the current thread. Cheap; safe to call
    /// when the user opens the Live Agents sheet.
    func reload() async {
        guard let bearer, let baseURL = settings.serverBaseURL, let threadId else { return }
        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        do {
            let response = try await client.listAgents(threadId: threadId, limit: 30)
            self.agents = response.agents
        } catch {
            loadError = "Couldn't load agents: \(error.localizedDescription)"
        }
    }

    /// Agents currently spawned/running. Drives the chat pill and the
    /// "N running" badge on the Live Agents sheet header.
    var activeAgents: [AgentRun] {
        agents.filter { $0.status.isActive }
    }

    /// Apply a streamed event. Caller is expected to have already matched
    /// `conversationId` against the active thread.
    func applyEvent(_ event: StreamEvent) {
        switch event {
        case .agentSpawned(_, let agentId, let name, let task):
            if agents.contains(where: { $0.agentId == agentId }) { return }
            // Insert an optimistic row so the pill shows immediately. The
            // next reload() (triggered shortly after) replaces it with the
            // server's canonical row, including mcpServers etc.
            let placeholder = AgentRun(
                agentId: agentId,
                conversationId: nil,
                name: name,
                task: task,
                status: .spawned,
                result: nil,
                error: nil,
                mcpServers: [],
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: nil,
                cacheCreationTokens: nil,
                costUsd: 0,
                startedAt: Date().timeIntervalSince1970 * 1000,
                completedAt: nil,
            )
            agents.insert(placeholder, at: 0)
            toolCounts[agentId] = 0
            Task { await reload() }

        case .agentTool(_, let agentId, _):
            toolCounts[agentId, default: 0] += 1

        case .agentDone(_, let agentId, let status):
            if let idx = agents.firstIndex(where: { $0.agentId == agentId }) {
                let prev = agents[idx]
                agents[idx] = AgentRun(
                    agentId: prev.agentId,
                    conversationId: prev.conversationId,
                    name: prev.name,
                    task: prev.task,
                    status: AgentRun.Status(rawValue: status) ?? .completed,
                    result: prev.result,
                    error: prev.error,
                    mcpServers: prev.mcpServers,
                    inputTokens: prev.inputTokens,
                    outputTokens: prev.outputTokens,
                    cacheReadTokens: prev.cacheReadTokens,
                    cacheCreationTokens: prev.cacheCreationTokens,
                    costUsd: prev.costUsd,
                    startedAt: prev.startedAt,
                    completedAt: Date().timeIntervalSince1970 * 1000,
                )
            }
            // Pull the canonical row (with token counts, durations) in.
            Task { await reload() }

        default:
            break
        }
    }
}
