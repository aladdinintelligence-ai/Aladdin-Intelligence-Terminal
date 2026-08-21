"use client";
import { useEffect, useState, useCallback } from "react";
import { useTheme, type ThemePreference } from "@/app/components/theme/ThemeProvider";
import { ProfileAvatar } from "@/app/components/account/ProfileAvatar";
import { processProfileImage, profileImageStore } from "@/app/services/profile/profile-image-store";
import { ConnectedWallet } from "@/app/components/wallet-connect/ConnectedWallet";
import { useAuth } from "@/app/hooks/useAuth";
import { updateProfile } from "@/app/services/profile";
import { EntryModal } from "@/app/components/landing/EntryModal";

const groups = [
  { label: "PERSONAL", items: ["Profile", "Appearance & Language", "Account & Security"] },
  { label: "ALADDIN", items: ["Aladdin Intelligence", "Integrations"] },
  { label: "SUBSCRIPTION", items: ["Plan & Billing"] },
  { label: "SUPPORT", items: ["Help & Tutorials"] },
];

export default function Settings() {
  const [active, setActive] = useState("Profile");
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("section");
    if (q) {
      const match = groups.flatMap((g) => g.items).find((x) => x.toLowerCase().startsWith(q.toLowerCase()));
      if (match) setActive(match);
    }
  }, []);

  return (
    <>
      <div className="pageTitle">
        <div>
          <span className="eyebrow">ACCOUNT & TERMINAL</span>
          <h1>Settings</h1>
          <p>Human account, connected wallet and Aladdin intelligence preferences.</p>
        </div>
      </div>
      <div className="settingsGrid expandedSettings">
        <aside>
          {groups.map((group) => (
            <div key={group.label}>
              <small>{group.label}</small>
              {group.items.map((x) => (
                <button onClick={() => setActive(x)} className={active === x ? "active" : ""} key={x}>{x}</button>
              ))}
            </div>
          ))}
        </aside>
        <section>
          <h2>{active}</h2>
          {active === "Profile" ? <Profile /> :
           active === "Appearance & Language" ? <Appearance /> :
           active === "Account & Security" ? <Security /> :
           active === "Aladdin Intelligence" ? <Intelligence /> :
           active === "Integrations" ? <Integrations /> :
           active === "Plan & Billing" ? <Billing /> :
           <Help />}
        </section>
      </div>
    </>
  );
}

function Profile() {
  const { user, updateUser } = useAuth();
  const [entryOpen, setEntryOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [primaryProfile, setPrimaryProfile] = useState("Trader");
  const [imageStatus, setImageStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.displayName);
      setUsername(user.username);
      setPrimaryProfile(user.primaryProfile);
    }
  }, [user]);

  const save = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateProfile({ displayName: name, username, primaryProfile });
      updateUser(updated);
      setSaveMsg("Profile saved.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }, [user, name, username, primaryProfile, updateUser]);

  async function changeImage(file?: File) {
    if (!file) return;
    try {
      setImageStatus("Processing image\u2026");
      await profileImageStore.save(await processProfileImage(file));
      setImageStatus("Profile image saved in this browser.");
    } catch (error) {
      setImageStatus(error instanceof Error ? error.message : "The image could not be saved.");
    }
  }

  async function removeImage() {
    await profileImageStore.remove();
    setImageStatus("Profile image removed.");
  }

  if (!user) {
    return (
      <div className="profileSettings">
        <div className="settingSections" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ marginBottom: 16, color: "var(--text-secondary)" }}>Sign in to view and edit your profile.</p>
          <button className="saveSettings" onClick={() => setEntryOpen(true)}>Sign In</button>
          <EntryModal open={entryOpen} onClose={() => setEntryOpen(false)} onAuth={() => setEntryOpen(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="profileSettings">
      <div className="profileImageEditor">
        <ProfileAvatar className="profileAvatar" initials={user.displayName.charAt(0)} />
        <div>
          <label className="smallAction profileImageButton">
            Change image<input type="file" accept="image/*" onChange={(event) => changeImage(event.target.files?.[0])} />
          </label>
          <button type="button" className="smallAction" onClick={removeImage}>Remove image</button>
          <small>Square centre crop. Stored only in this browser.</small>
          {imageStatus ? <p role="status">{imageStatus}</p> : null}
        </div>
      </div>
      <label>
        <span><b>Display name</b><small>Your public display name</small></span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <span><b>Username</b><small>Unique handle (letters, numbers, underscores)</small></span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label>
        <span><b>Email</b><small>From your sign-in provider</small></span>
        <input value={user.email || "Not provided"} readOnly />
      </label>
      <label>
        <span><b>Role</b><small>Your primary Aladdin profile</small></span>
        <select value={primaryProfile} onChange={(e) => setPrimaryProfile(e.target.value)}>
          <option value="Trader">Trader</option>
          <option value="Analyst">Analyst</option>
          <option value="Token Creator">Token Creator</option>
        </select>
      </label>
      <ConnectedWallet />
      <button className="saveSettings" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving\u2026" : "Save profile"}
      </button>
      {saveMsg ? <p className="settingsNote">{saveMsg}</p> : null}
    </div>
  );
}

function Appearance() {
  const [density, setDensity] = useState("Compact");
  const { preference, setPreference } = useTheme();
  const choices: { value: ThemePreference; label: string; note: string }[] = [
    { value: "dark", label: "Dark", note: "Available" },
    { value: "light", label: "Light", note: "Available" },
    { value: "system", label: "System", note: "Follow device preference" },
  ];
  return (
    <div className="settingSections">
      <h3>THEME</h3>
      <div className="themeChoices" role="radiogroup" aria-label="Application theme">
        {choices.map((choice) => (
          <button type="button" role="radio" aria-checked={preference === choice.value} className={preference === choice.value ? "selected" : ""} onClick={() => setPreference(choice.value)} key={choice.value}>
            {choice.label}<small>{choice.note}</small>
          </button>
        ))}
      </div>
      <SettingSelect label="Language" options={["English"]} />
      <SettingSelect label="Timezone" options={["Europe/London", "UTC", "America/New_York"]} />
      <SettingSelect label="Display currency" options={["USD", "GBP", "EUR"]} />
      <label>
        <span><b>Interface density</b><small>Terminal information spacing</small></span>
        <select value={density} onChange={(e) => setDensity(e.target.value)}>
          <option>Compact</option>
          <option>Comfortable</option>
        </select>
      </label>
      <SettingSelect label="Number formatting" options={["1.24M / 84.2K", "1,240,000 / 84,200"]} />
    </div>
  );
}

function SettingSelect({ label, options }: { label: string; options: string[] }) {
  return (
    <label>
      <span><b>{label}</b><small>Local interface preference</small></span>
      <select>{options.map((x) => <option key={x}>{x}</option>)}</select>
    </label>
  );
}

function Security() {
  const { user } = useAuth();
  return (
    <div className="settingSections">
      <Info label="Email" value={user?.email || "Not provided"} />
      <Info label="Authentication" value={user ? "Signed in" : "Not signed in"} />
      <Info label="Account and wallet" value="Separate states" />
      <ConnectedWallet />
      <Info label="Active sessions" value="This browser" />
      <Toggle label="Two-factor authentication" />
      <Info label="Member since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"} />
      <button className="dangerSetting">Delete account</button>
    </div>
  );
}

function Intelligence() {
  return (
    <div className="settingSections">
      <h3>GENERAL</h3>
      <Toggle label="What Changed visibility" on />
      <Toggle label="Behavioural chart annotations" on />
      <Toggle label="Automatic historical matching" />
      <SettingSelect label="Evidence density" options={["Dense", "Balanced"]} />
      <SettingSelect label="Default answer profile" options={["Trader", "Analyst", "Token Creator"]} />
      <h3>ASK ALADDIN</h3>
      <Toggle label="Suggested follow-up questions" on />
      <Toggle label="Preserve session context" on />
      <h3>MEMORY</h3>
      <Toggle label="Remember searched entities" on />
      <Toggle label="Changed since last search" on />
      <SettingSelect label="Retention period" options={["30 days", "90 days", "Until deleted"]} />
    </div>
  );
}

function Integrations() {
  return (
    <div className="settingSections">
      <h3>TELEGRAM</h3>
      <Info label="Connection" value="Not connected" />
      <button className="saveSettings">Connect Telegram</button>
      {["Formation alerts", "Profitable wallet alerts", "Creator activity", "Watchlist updates", "Cluster activity"].map((x) => (
        <Toggle key={x} label={x} />
      ))}
    </div>
  );
}

function Billing() {
  return (
    <div className="settingSections">
      <Info label="Plan" value="Aladdin Free" />
      <Info label="Monthly price" value="$0" />
      <Info label="Ask Aladdin allowance" value="Limited" />
      <Info label="API allowance" value="10,000 calls" />
      <button className="smallAction">Upgrade plan</button>
    </div>
  );
}

function Help() {
  const sections: Record<string, string[]> = {
    "GETTING STARTED": ["Launches", "Search CA", "Search wallet", "Terminal", "Ask Aladdin", "Alerts", "Telegram"],
    "UNDERSTANDING ALADDIN": ["Behaviour labels", "Market Formation", "First 100", "Profitable Wallets", "Clusters", "Insider / Creator Activity", "Historical Match", "Data Coverage", "Analyst methodology & evidence exports"],
    "DEVELOPER": ["API docs", "Examples", "Changelog", "Status"],
  };
  return (
    <div className="helpGrid">
      {Object.entries(sections).map(([title, items]) => (
        <section key={title}>
          <h3>{title}</h3>
          {items.map((x) => (
            <button key={x}>{x}<span>{"\u2192"}</span></button>
          ))}
        </section>
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <p className="settingInfo"><span>{label}</span><b>{value}</b></p>;
}

function Toggle({ label, on = false }: { label: string; on?: boolean }) {
  const [checked, setChecked] = useState(on);
  return (
    <label>
      <span><b>{label}</b><small>Frontend preference</small></span>
      <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
    </label>
  );
}
