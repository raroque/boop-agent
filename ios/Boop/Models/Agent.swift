import Foundation

/// An execution sub-agent the dispatcher spawned to complete a task.
/// Mirrors `convex.executionAgents` plus the `agentLogs` timeline that
/// drives the per-step rail in the Live Agents view.
struct AgentRun: Identifiable, Decodable, Equatable {
    enum Status: String, Codable, Equatable {
        case spawned, running, completed, failed, cancelled
        // Some convex rows include `paused`; map it to running for display.
        case paused

        var isActive: Bool {
            switch self {
            case .spawned, .running: return true
            default: return false
            }
        }
    }

    let agentId: String
    let conversationId: String?
    let name: String
    let task: String
    let status: Status
    let result: String?
    let error: String?
    let mcpServers: [String]
    let inputTokens: Int
    let outputTokens: Int
    let cacheReadTokens: Int?
    let cacheCreationTokens: Int?
    let costUsd: Double
    let startedAt: Double
    let completedAt: Double?

    var id: String { agentId }
    var startedAtDate: Date { Date(timeIntervalSince1970: startedAt / 1000) }
    var completedAtDate: Date? { completedAt.map { Date(timeIntervalSince1970: $0 / 1000) } }

    /// Short identifier shown after the agent name (`turn-8f3a`).
    var shortTag: String {
        "turn-\(String(agentId.suffix(4)))"
    }

    /// Default lucide icon for this agent — looks up the first hint we
    /// can find in name + integrations. Matches the design's
    /// calendar/search/etc disc icons.
    var lucideIcon: LucideName {
        let haystacks = ([name] + mcpServers).joined(separator: " ").lowercased()
        if haystacks.contains("calendar") || haystacks.contains("schedule") { return .calendar }
        if haystacks.contains("search") || haystacks.contains("research")   { return .search }
        if haystacks.contains("code") || haystacks.contains("git")          { return .code }
        if haystacks.contains("mail") || haystacks.contains("newsletter") || haystacks.contains("gmail") { return .mail }
        if haystacks.contains("pdf") || haystacks.contains("file") || haystacks.contains("doc") || haystacks.contains("brief") || haystacks.contains("pitch") || haystacks.contains("itinerary") { return .fileText }
        return .zap
    }
}

/// One step in the agent's tool timeline. `logType` distinguishes thinking
/// text from tool invocations / results. The design renders only the
/// `tool_use` rows as steps with badges; other types are folded into the
/// preceding step or shown as inline notes.
struct AgentLog: Identifiable, Decodable, Equatable {
    let _id: String
    let agentId: String
    let logType: LogType
    let toolName: String?
    let accounts: [String]?
    let content: String
    let createdAt: Double

    enum LogType: String, Codable, Equatable {
        case thinking, tool_use, tool_result, text, error
    }

    var id: String { _id }
    var createdAtDate: Date { Date(timeIntervalSince1970: createdAt / 1000) }

    /// Strip the standard `mcp__boop-foo__` / `mcp__telegram__` prefixes
    /// to get the human-readable tool name shown on the badge.
    var prettyToolName: String? {
        guard let toolName else { return nil }
        return toolName.replacingOccurrences(
            of: #"^mcp__[a-z0-9-]+__"#,
            with: "",
            options: .regularExpression,
        )
    }
}

struct AgentsResponse: Decodable {
    let agents: [AgentRun]
}

struct AgentDetailResponse: Decodable {
    let agent: AgentRun
}

struct AgentLogsResponse: Decodable {
    let agent: AgentRun
    let logs: [AgentLog]
}
