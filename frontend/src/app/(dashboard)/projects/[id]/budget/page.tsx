"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DollarSign, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getBudget, getCostsByAgent, type Budget, type CostByAgent } from "@/lib/api";

const ALERT_STYLES: Record<string, { badge: string; bar: string; text: string }> = {
  normal: {
    badge: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
    bar: "bg-[#2D6A4F]",
    text: "text-[#2D6A4F]",
  },
  warning: {
    badge: "bg-[#B8860B]/10 text-[#B8860B]",
    bar: "bg-[#B8860B]",
    text: "text-[#B8860B]",
  },
  critical: {
    badge: "bg-[#D4583A]/10 text-[#D4583A]",
    bar: "bg-[#D4583A]",
    text: "text-[#D4583A]",
  },
};

const ROLE_COLORS: Record<string, string> = {
  ceo: "bg-[#7B4F9D]",
  cpo: "bg-[#D4583A]",
  cto: "bg-[#2D6A4F]",
  cfo: "bg-[#B8860B]",
  backend_dev: "bg-[#3A5FCD]",
  frontend_dev: "bg-[#C74882]",
  qa_engineer: "bg-[#D97706]",
};

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function BudgetPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [budget, setBudget] = useState<Budget | null>(null);
  const [agentCosts, setAgentCosts] = useState<CostByAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getBudget(projectId), getCostsByAgent(projectId)])
      .then(([b, ac]) => {
        setBudget(b);
        setAgentCosts(ac);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load budget data");
        setBudget(null);
        setAgentCosts([]);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card
              key={i}
              className="bg-white border-[#1A1A18]/[0.08] animate-pulse"
            >
              <CardContent className="p-5 h-24" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        {error && (
          <div className="flex items-center justify-between rounded-md border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3 mb-4">
            <p className="text-sm text-[#D4583A]">{error}</p>
            <button
              className="text-xs text-[#D4583A] hover:text-[#D4583A]/80 underline"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        )}
        <Card className="bg-white border-[#1A1A18]/[0.08] border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <DollarSign className="size-8 text-[#1A1A18]/35 mb-3" />
            <p className="text-sm text-[#1A1A18]/70">No budget data available</p>
            <p className="text-xs text-[#1A1A18]/45 mt-1">
              Budget tracking begins when the project starts
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alertStyle = ALERT_STYLES[budget.alert_level] ?? ALERT_STYLES.normal;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A18]">
            Budget Dashboard
          </h2>
          <p className="text-xs text-[#1A1A18]/55 mt-1">
            Token usage and cost tracking
          </p>
        </div>
        <Badge className={`text-xs px-2.5 py-0.5 gap-1 ${alertStyle.badge}`}>
          <AlertTriangle className="size-3" />
          {budget.alert_level}
        </Badge>
      </div>

      {/* Budget utilization */}
      <Card className="bg-white border-[#1A1A18]/[0.08]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-[#1A1A18]/70 flex items-center gap-2">
            <TrendingUp className="size-4" />
            Budget Utilization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between mb-1">
            <span className={`text-3xl font-bold ${alertStyle.text}`}>
              {Math.round(budget.utilization_pct)}%
            </span>
            <span className="text-xs text-[#1A1A18]/55">
              ${(budget.spent_cents / 100).toFixed(2)} of ${(budget.total_budget_cents / 100).toFixed(2)}
            </span>
          </div>
          <div className="h-3 bg-[#F0EFEC] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${alertStyle.bar}`}
              style={{
                width: `${Math.min(budget.utilization_pct, 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#1A1A18]/45">
            <span>$0</span>
            <span>${(budget.total_budget_cents / 200).toFixed(2)}</span>
            <span>${(budget.total_budget_cents / 100).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cost by category */}
        <Card className="bg-white border-[#1A1A18]/[0.08]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-[#1A1A18]/70">
              Cost by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const categories = [
                { name: "LLM", cents: budget.breakdown.llm },
                { name: "Infrastructure", cents: budget.breakdown.infrastructure },
                { name: "Third Party", cents: budget.breakdown.third_party },
              ];
              const hasData = categories.some((c) => c.cents > 0);
              if (!hasData) {
                return (
                  <p className="text-xs text-[#1A1A18]/55 text-center py-4">
                    No cost data
                  </p>
                );
              }
              return (
                <div className="space-y-0">
                  <div className="flex items-center justify-between pb-2 border-b border-[#1A1A18]/[0.08] bg-[#F4F2EF] -mx-6 px-6 -mt-1 pt-1">
                    <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider">
                      Category
                    </span>
                    <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider">
                      Amount
                    </span>
                  </div>
                  {categories.map((item, i) => (
                    <div key={item.name}>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-xs text-[#1A1A18]/70">
                          {item.name}
                        </span>
                        <span className="text-xs font-mono text-[#1A1A18]">
                          ${(item.cents / 100).toFixed(4)}
                        </span>
                      </div>
                      {i < categories.length - 1 && (
                        <Separator className="bg-[#1A1A18]/[0.06]" />
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Cost by agent */}
        <Card className="bg-white border-[#1A1A18]/[0.08]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-[#1A1A18]/70">
              Cost by Agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agentCosts.length === 0 ? (
              <p className="text-xs text-[#1A1A18]/55 text-center py-4">
                No agent cost data
              </p>
            ) : (
              <div className="space-y-0">
                {/* Table header */}
                <div className="flex items-center justify-between pb-2 border-b border-[#1A1A18]/[0.08] bg-[#F4F2EF] -mx-6 px-6 -mt-1 pt-1">
                  <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider">
                    Agent
                  </span>
                  <div className="flex gap-6">
                    <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider w-16 text-right">
                      Tokens
                    </span>
                    <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider w-16 text-right">
                      Cost
                    </span>
                  </div>
                </div>
                {agentCosts.map((agent, i) => (
                  <div key={agent.agent_role}>
                    <div className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`size-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${
                            ROLE_COLORS[agent.agent_role] ?? "bg-[#78766F]"
                          }`}
                        >
                          {agent.agent_role
                            .split("_")
                            .map((w) => w[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </span>
                        <span className="text-xs text-[#1A1A18]/70">
                          {formatRole(agent.agent_role)}
                        </span>
                      </div>
                      <div className="flex gap-6">
                        <span className="text-xs font-mono text-[#1A1A18]/70 w-16 text-right">
                          {agent.total_tokens.toLocaleString()}
                        </span>
                        <span className="text-xs font-mono text-[#1A1A18] w-16 text-right">
                          ${(agent.total_cents / 100).toFixed(4)}
                        </span>
                      </div>
                    </div>
                    {i < agentCosts.length - 1 && (
                      <Separator className="bg-[#1A1A18]/[0.06]" />
                    )}
                  </div>
                ))}
                {/* Total row */}
                <Separator className="bg-[#1A1A18]/[0.10]" />
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-xs font-medium text-[#1A1A18]">
                    Total
                  </span>
                  <div className="flex gap-6">
                    <span className="text-xs font-mono font-medium text-[#1A1A18]/80 w-16 text-right">
                      {agentCosts
                        .reduce((sum, a) => sum + a.total_tokens, 0)
                        .toLocaleString()}
                    </span>
                    <span className="text-xs font-mono font-medium text-[#1A1A18] w-16 text-right">
                      $
                      {(agentCosts
                        .reduce((sum, a) => sum + a.total_cents, 0) / 100)
                        .toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
