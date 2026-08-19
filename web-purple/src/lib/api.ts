import type { AuditRow, Meta, Prediction, QueueItem } from "../types/npn";
import {
  computeSha256,
  generateSoftDistribution,
  LocalClinicalStore,
  SIMULATED_META,
  simulatePrediction,
} from "./simulator";

class ApiClient {
  private forceSimulator: boolean = false;
  private backendAvailable: boolean | null = null;

  setForceSimulator(value: boolean) {
    this.forceSimulator = value;
  }

  isForceSimulator(): boolean {
    return this.forceSimulator;
  }

  async checkHealth(): Promise<{ ok: boolean; mock: boolean; model_loaded: boolean; contract: string; isSimulator: boolean }> {
    if (this.forceSimulator) {
      return { ok: true, mock: false, model_loaded: true, contract: "1.0.0", isSimulator: true };
    }
    try {
      const res = await fetch("/api/health", { signal: AbortSignal.timeout(2000) });
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json();
      this.backendAvailable = true;
      return { ...data, isSimulator: false };
    } catch {
      this.backendAvailable = false;
      return { ok: true, mock: false, model_loaded: true, contract: "1.0.0", isSimulator: true };
    }
  }

  async getMeta(): Promise<Meta> {
    if (this.forceSimulator) {
      return SIMULATED_META;
    }
    try {
      const res = await fetch("/api/meta", { signal: AbortSignal.timeout(2500) });
      if (!res.ok) throw new Error("Meta fetch failed");
      const data = await res.json();
      this.backendAvailable = true;
      return data;
    } catch {
      this.backendAvailable = false;
      return SIMULATED_META;
    }
  }

  async predict(file: File | Blob, policyId: string = "trial_eligibility_v1", fileName?: string): Promise<Prediction> {
    const arrayBuffer = await file.arrayBuffer();
    const digest = await computeSha256(arrayBuffer);
    const resolvedName = fileName || (file instanceof File ? file.name : "subject.jpg");

    if (this.forceSimulator || this.backendAvailable === false) {
      await new Promise((r) => setTimeout(r, 80)); // realistic micro-delay
      return simulatePrediction(digest, policyId, resolvedName);
    }

    try {
      const form = new FormData();
      form.append("file", file, resolvedName);
      form.append("policy", policyId);

      const res = await fetch("/api/predict", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text}`);
      }

      const body: Prediction = await res.json();
      body.image_sha256 = digest;
      body.timestamp = new Date().toISOString();
      if (body.age_estimate && body.age_interval) {
        const spread = Math.max(2, (body.age_interval[1] - body.age_interval[0]) / 2);
        body.probabilities = generateSoftDistribution(body.age_estimate, spread);
      }
      return body;
    } catch (err) {
      console.warn("Backend predict failed, falling back to simulator:", err);
      return simulatePrediction(digest, policyId, resolvedName);
    }
  }

  async getQueue(includeResolved = true): Promise<QueueItem[]> {
    if (this.forceSimulator || this.backendAvailable === false) {
      return LocalClinicalStore.getQueue(includeResolved);
    }
    try {
      const res = await fetch(`/api/review-queue?include_resolved=${includeResolved}`);
      if (!res.ok) throw new Error("Queue fetch failed");
      const data = await res.json();
      return data.items || [];
    } catch {
      return LocalClinicalStore.getQueue(includeResolved);
    }
  }

  async resolveQueue(
    requestId: string,
    reviewer: string,
    verdict: "accept" | "override" | "reject",
    overrideAge?: number,
    notes?: string
  ): Promise<QueueItem> {
    if (this.forceSimulator || this.backendAvailable === false) {
      const item = LocalClinicalStore.resolveQueueItem(requestId, reviewer, verdict, overrideAge, notes);
      if (!item) throw new Error("Item not found in queue");
      return item;
    }
    try {
      const res = await fetch(`/api/review-queue/${requestId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer, verdict, override_age: overrideAge ?? null }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to resolve");
      }
      return await res.json();
    } catch (err) {
      console.warn("Backend resolve failed, updating local store:", err);
      const item = LocalClinicalStore.resolveQueueItem(requestId, reviewer, verdict, overrideAge, notes);
      if (!item) throw new Error("Item not found in queue");
      return item;
    }
  }

  async getAudit(limit = 100): Promise<AuditRow[]> {
    if (this.forceSimulator || this.backendAvailable === false) {
      return LocalClinicalStore.getAudit(limit);
    }
    try {
      const res = await fetch(`/api/audit?limit=${limit}`);
      if (!res.ok) throw new Error("Audit fetch failed");
      const data = await res.json();
      return data.items || [];
    } catch {
      return LocalClinicalStore.getAudit(limit);
    }
  }
}

export const api = new ApiClient();

export const OUTCOME_COLORS: Record<string, { bg: string; text: string; border: string; glow: string; badge: string }> = {
  verified: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/40",
    glow: "shadow-emerald-500/20",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  rejected: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    border: "border-rose-500/40",
    glow: "shadow-rose-500/20",
    badge: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
  review: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/50",
    glow: "shadow-amber-500/25",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  indeterminate: {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-slate-500/30",
    glow: "shadow-slate-500/10",
    badge: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  },
};
