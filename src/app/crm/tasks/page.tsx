"use client";

import { useState } from "react";

const SAMPLE_TASKS = [
  { id: 1, title: "Follow up with recent leads", status: "todo", priority: "high", dueDate: "Today" },
  { id: 2, title: "Prepare proposal for client", status: "in_progress", priority: "medium", dueDate: "Tomorrow" },
  { id: 3, title: "Review chatbot implementation", status: "todo", priority: "low", dueDate: "This week" },
];

export default function TasksPage() {
  const [tasks] = useState(SAMPLE_TASKS);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Tasks</h1>
          <p className="text-sm text-grey mt-1">Manage your to-dos and follow-ups</p>
        </div>
        <button className="btn-primary text-sm">+ New Task</button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* To Do */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-grey" />
            To Do
          </h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === "todo").map(task => (
              <div key={task.id} className="p-4 rounded-lg border border-border bg-bg hover:border-primary/30 transition-colors">
                <p className="text-sm font-medium">{task.title}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    task.priority === "high" ? "bg-red-500/20 text-red-400" :
                    task.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-grey/20 text-grey"
                  }`}>
                    {task.priority}
                  </span>
                  <span className="text-xs text-grey">{task.dueDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* In Progress */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-primary" />
            In Progress
          </h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === "in_progress").map(task => (
              <div key={task.id} className="p-4 rounded-lg border border-border bg-bg hover:border-primary/30 transition-colors">
                <p className="text-sm font-medium">{task.title}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    task.priority === "high" ? "bg-red-500/20 text-red-400" :
                    task.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-grey/20 text-grey"
                  }`}>
                    {task.priority}
                  </span>
                  <span className="text-xs text-grey">{task.dueDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Completed */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            Completed
          </h3>
          <div className="text-center py-8 text-grey text-sm">
            No completed tasks yet
          </div>
        </div>
      </div>
    </div>
  );
}
