import { BackButton } from "@/app/components/navigation/BackButton";
export default function Api() {
  return (
    <>
      <BackButton fallback="/launches" />
      <div className="pageTitle">
        <div>
          <span className="eyebrow">DEVELOPER ACCESS</span>
          <h1>Aladdin API</h1>
          <p>
            Prototype documentation only. No production API keys are issued
            here.
          </p>
        </div>
      </div>
      <div className="dashboardPanels">
        <section>
          <h2>ALADDIN API</h2>
          <p>
            Market intelligence · Tokens · Wallets · Behaviours · Formations ·
            Historical matches · Launches
          </p>
        </section>
        <section>
          <h2>ASK ALADDIN API</h2>
          <p>Questions · Sessions · Context · Evidence responses</p>
        </section>
      </div>
    </>
  );
}
