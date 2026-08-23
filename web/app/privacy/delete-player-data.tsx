"use client";

import Link from "next/link";
import { useState } from "react";

type DeleteState = "idle" | "deleting" | "deleted" | "error";

export function DeletePlayerData() {
  const [state, setState] = useState<DeleteState>("idle");

  async function deleteData() {
    setState("deleting");
    try {
      const response = await fetch("/api/player", { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete failed with status ${response.status}`);
      setState("deleted");
    } catch {
      setState("error");
    }
  }

  if (state === "deleted") {
    return (
      <div className="data-control-result" aria-live="polite">
        <strong>Your player data was deleted.</strong>
        <p>Your next visit creates a new anonymous player identity.</p>
        <Link href="/">Return to today’s pack</Link>
      </div>
    );
  }

  return (
    <div className="data-controls">
      <button
        type="button"
        className="delete-data-button"
        onClick={() => void deleteData()}
        disabled={state === "deleting"}
      >
        {state === "deleting" ? "Deleting…" : "Delete my player data"}
      </button>
      <p className="data-control-status" aria-live="polite">
        {state === "error"
          ? "Deletion failed. Nothing was changed; please try again."
          : "This removes this browser identity’s vote history and clears its cookie."}
      </p>
    </div>
  );
}
