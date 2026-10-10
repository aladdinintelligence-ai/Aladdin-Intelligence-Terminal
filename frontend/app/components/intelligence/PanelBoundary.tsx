"use client";
import { Component, type ReactNode } from "react";

interface PanelBoundaryProps {
  name: string;
  children: ReactNode;
}

interface PanelBoundaryState {
  error: Error | null;
}

export default class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  state: PanelBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PanelBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[panel] ${this.props.name} failed to render:`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panelError" role="alert">
          <small>PANEL UNAVAILABLE</small>
          <span>{this.props.name} could not be rendered. Other panels are unaffected.</span>
          <button type="button" onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}