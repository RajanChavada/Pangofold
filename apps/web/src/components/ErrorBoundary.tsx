import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", textAlign: "center", fontFamily: "Inter, sans-serif" }}>
          <h1 style={{ fontSize: "20px", fontWeight: "bold", color: "#dc2626" }}>Something went wrong</h1>
          <pre style={{
            marginTop: "16px",
            padding: "16px",
            background: "#fef2f2",
            borderRadius: "8px",
            fontSize: "13px",
            textAlign: "left",
            overflow: "auto",
            maxWidth: "600px",
            marginInline: "auto",
            color: "#991b1b",
          }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
