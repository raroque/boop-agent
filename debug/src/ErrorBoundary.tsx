import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Dashboard error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: "2rem",
            fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
            color: "#f43f5e",
            background: "#020617",
            minHeight: "100vh",
          }}
        >
          <h2 style={{ marginBottom: "0.5rem", color: "#f87171" }}>
            Dashboard crashed
          </h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <p style={{ marginTop: "1rem", color: "#94a3b8", fontSize: "0.85rem" }}>
            Check the server logs and reload.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
