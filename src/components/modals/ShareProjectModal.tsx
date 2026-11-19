"use client";

/**
 * "Share project": invite signed-in people by email as Editor or Member, change roles, remove. A two-column note
 * explains what members share and what stays with each person.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Users, X } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { inviteProjectMember, listProjectMembers, removeProjectMember, type Project, type ProjectMember } from "@/components/shell/projects-store";
import { ModalShell } from "./ModalShell";

const ROLE_LABEL: Record<ProjectMember["role"], string> = { editor: "Editor", member: "Member" };
const ROLE_HINT: Record<ProjectMember["role"], string> = {
  editor: "Edits the project's instructions and files",
  member: "Works with the instructions and files, keeps tasks to themselves",
};

function RoleSelect({ value, onChange, label }: { value: ProjectMember["role"]; onChange: (role: ProjectMember["role"]) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as ProjectMember["role"])}
      className="h-[36px] shrink-0 cursor-pointer rounded-[10px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] px-[8px] text-[14px] text-[var(--om-text-1)] outline-none focus:border-[var(--om-border-focus)]"
    >
      <option value="member">Member</option>
      <option value="editor">Editor</option>
    </select>
  );
}

export function ShareProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectMember["role"]>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjectMembers(project.id)
      .then((r) => setMembers(r.members))
      .catch(() => setMembers([]));
  }, [project.id]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const member = await inviteProjectMember(project.id, value, role);
      setMembers((list) => [...(list ?? []).filter((m) => m.email !== member.email), member]);
      setEmail("");
      toast(`Invited ${member.email}`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  };
  const changeRole = async (m: ProjectMember, next: ProjectMember["role"]) => {
    setMembers((list) => (list ?? []).map((x) => (x.email === m.email ? { ...x, role: next } : x)));
    await inviteProjectMember(project.id, m.email, next).catch((err: unknown) => {
      toast(err instanceof Error ? err.message : "The role could not be changed.", "error");
      setMembers((list) => (list ?? []).map((x) => (x.email === m.email ? m : x)));
    });
  };
  const remove = async (m: ProjectMember) => {
    setMembers((list) => (list ?? []).filter((x) => x.email !== m.email));
    await removeProjectMember(project.id, m.email).catch((err: unknown) => {
      toast(err instanceof Error ? err.message : "They could not be removed.", "error");
      setMembers((list) => [...(list ?? []), m]);
    });
  };

  return (
    <ModalShell title="Share project" onClose={onClose} className="flex max-h-[calc(100vh-40px)] w-[520px] max-w-[calc(100vw-32px)] flex-col gap-[16px] overflow-y-auto rounded-[16px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[24px] shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
      <div className="flex flex-col gap-[4px] pe-[24px]">
        <h2 className="text-[18px] font-semibold leading-[24px]">Share &ldquo;{project.name}&rdquo;</h2>
        <p className="text-[14px] leading-[20px] text-[var(--om-text-3)]">Invite people who use {brand.name} by the email they sign in with.</p>
      </div>

      <form onSubmit={(e) => void invite(e)} className="flex gap-[8px]">
        <input
          type="email"
          aria-label="Email address"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-[36px] min-w-0 flex-1 rounded-[10px] border border-[var(--om-border-strong)] bg-transparent px-[12px] text-[14px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)] focus:border-[var(--om-border-focus)]"
        />
        <RoleSelect value={role} onChange={setRole} label="Role for the invitation" />
        <button type="submit" disabled={!email.trim() || busy} className="h-[36px] shrink-0 cursor-pointer rounded-[10px] bg-[var(--om-btn-primary)] px-[14px] text-[14px] font-medium text-[var(--om-text-inverse)] outline-none hover:opacity-90 disabled:cursor-default disabled:opacity-50">
          Invite
        </button>
      </form>
      <p className="-mt-[8px] text-[12px] leading-[16px] text-[var(--om-text-3)]">{ROLE_HINT[role]}.</p>
      {error ? (
        <p role="alert" className="-mt-[8px] text-[13px] leading-[18px] text-[var(--om-danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-[4px]">
        <span className="text-[13px] font-medium leading-[18px] text-[var(--om-text-3)]">People with access</span>
        {members === null ? (
          <div className="h-[40px] animate-pulse rounded-[10px] bg-[var(--om-fill)]" />
        ) : members.length === 0 ? (
          <p className="flex items-center gap-[8px] py-[8px] text-[14px] text-[var(--om-text-3)]">
            <Users size={16} /> Only you. Invite someone above.
          </p>
        ) : (
          <ul aria-label="Project members" className="flex flex-col gap-px">
            {members.map((m) => (
              <li key={m.email} className="flex h-[44px] items-center gap-[8px] rounded-[10px] px-[4px] hover:bg-[var(--om-fill-subtle)]">
                <span className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-[var(--om-fill)] text-[12px] font-medium uppercase">{m.email[0]}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]">{m.email}</span>
                {!m.memberId ? <span className="shrink-0 text-[12px] text-[var(--om-text-3)]">Invited</span> : null}
                <RoleSelect value={m.role} onChange={(next) => void changeRole(m, next)} label={`Role of ${m.email}`} />
                <button type="button" aria-label={`Remove ${m.email}`} onClick={() => void remove(m)} className="flex size-[28px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[var(--om-icon-2)] outline-none hover:bg-[var(--om-fill)]">
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-[12px] rounded-[12px] bg-[var(--om-fill-subtle)] p-[14px] text-[13px] leading-[18px] max-sm:grid-cols-1">
        <div className="flex flex-col gap-[4px]">
          <span className="font-medium text-[var(--om-text-1)]">Everyone in the project gets</span>
          <span className="text-[var(--om-text-2)]">The same instructions and files. When an {ROLE_LABEL.editor} changes them, everyone picks up the new version. Tasks stay visible only to whoever started them.</span>
        </div>
        <div className={cn("flex flex-col gap-[4px]")}>
          <span className="font-medium text-[var(--om-text-1)]">Each person keeps</span>
          <span className="text-[var(--om-text-2)]">Their own app connections, automations and bill. A task always runs on the computer and Orgo account of the person who launched it.</span>
        </div>
      </div>
    </ModalShell>
  );
}
