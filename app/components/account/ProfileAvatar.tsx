"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { profileImageStore } from "@/app/services/profile/profile-image-store";
import { useAuth } from "@/app/hooks/useAuth";

export function ProfileAvatar({
  className = "",
  initials,
}: {
  className?: string;
  initials?: string;
}) {
  const { user } = useAuth();
  const [localUrl, setLocalUrl] = useState("");

  const fallbackInitials = initials || user?.displayName?.charAt(0)?.toUpperCase() || "?";

  useEffect(() => {
    let current = "",
      mounted = true;
    const load = async () => {
      const blob = await profileImageStore.load();
      if (!mounted) return;
      if (current) URL.revokeObjectURL(current);
      current = blob ? URL.createObjectURL(blob) : "";
      setLocalUrl(current);
    };
    load();
    addEventListener("aladdin-profile-image-change", load);
    return () => {
      mounted = false;
      removeEventListener("aladdin-profile-image-change", load);
      if (current) URL.revokeObjectURL(current);
    };
  }, []);

  const avatarUrl = localUrl || user?.avatarUrl || null;

  return (
    <span className={`userAvatar ${className}`}>
      {avatarUrl ? (
        <Image src={avatarUrl} alt="Profile" width={96} height={96} unoptimized />
      ) : (
        fallbackInitials
      )}
    </span>
  );
}
