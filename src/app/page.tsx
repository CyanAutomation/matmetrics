"use client"

import React, { useState, useEffect } from 'react';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarTrigger, SidebarInset, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { DashboardOverview } from "@/components/dashboard-overview";
import { SessionLogForm } from "@/components/session-log-form";
import { SessionHistory } from "@/components/session-history";
import { TagManager } from "@/components/tag-manager";
import { getSessions } from "@/lib/storage";
import { JudoSession } from "@/lib/types";
import { LayoutDashboard, PlusCircle, History, Info, Trophy, Plus, Tags } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sessions, setSessions] = useState<JudoSession[]>([]);

  useEffect(() => {
    refreshSessions();
  }, []);

  const refreshSessions = () => {
    setSessions(getSessions());
  };

  const handleSessionAdded = () => {
    refreshSessions();
    setActiveTab("history");
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar className="border-r border-primary/10">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg">
                <Trophy className="h-6 w-6" />
              </div>
              <div className="font-headline font-black text-2xl tracking-tighter text-primary">
                MatMetrics
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="p-2">
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={activeTab === "dashboard"} 
                  onClick={() => setActiveTab("dashboard")}
                  className="py-6 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                >
                  <LayoutDashboard className="h-5 w-5" />
                  <span className="text-base font-semibold">Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={activeTab === "log"} 
                  onClick={() => setActiveTab("log")}
                  className="py-6 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                >
                  <PlusCircle className="h-5 w-5" />
                  <span className="text-base font-semibold">Log Session</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={activeTab === "history"} 
                  onClick={() => setActiveTab("history")}
                  className="py-6 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                >
                  <History className="h-5 w-5" />
                  <span className="text-base font-semibold">History</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={activeTab === "tags"} 
                  onClick={() => setActiveTab("tags")}
                  className="py-6 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                >
                  <Tags className="h-5 w-5" />
                  <span className="text-base font-semibold">Tag Manager</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            
            <Separator className="my-6 bg-primary/5" />
            
            <div className="px-4 py-2">
               <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Training Stats</div>
               <div className="space-y-4">
                 <div className="flex items-center justify-between">
                   <span className="text-sm font-medium">Sessions</span>
                   <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{sessions.length}</span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span className="text-sm font-medium">This Month</span>
                   <span className="text-sm font-bold bg-accent/10 text-accent-foreground px-2 py-0.5 rounded">
                     {sessions.filter(s => {
                        const date = new Date(s.date);
                        const now = new Date();
                        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                     }).length}
                   </span>
                 </div>
               </div>
            </div>
          </SidebarContent>
          <SidebarFooter className="p-4">
             <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
               <Info className="h-3 w-3" />
               <span>v1.1.0 Stable</span>
             </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex-1 flex flex-col bg-background/50 overflow-hidden relative">
          <header className="h-16 border-b flex items-center px-6 justify-between bg-white/80 dark:bg-card/80 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <h2 className="text-xl font-bold tracking-tight text-primary">
                {activeTab === "dashboard" && "Training Overview"}
                {activeTab === "log" && "Log Practice"}
                {activeTab === "history" && "Session History"}
                {activeTab === "tags" && "Manage Tags"}
              </h2>
            </div>
            <div className="flex items-center gap-3">
               <Button 
                variant="default" 
                size="sm" 
                className="hidden sm:flex items-center gap-2 font-bold shadow-sm"
                onClick={() => setActiveTab("log")}
               >
                 <PlusCircle className="h-4 w-4" />
                 Log Session
               </Button>
               <ModeToggle />
               <div className="hidden sm:flex flex-col items-end mr-2">
                 <span className="text-sm font-bold">Judoka User</span>
                 <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">White Belt (Demo)</span>
               </div>
               <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold border-2 border-primary/20">
                 JU
               </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
              {activeTab === "dashboard" && (
                <DashboardOverview sessions={sessions} />
              )}
              {activeTab === "log" && (
                <SessionLogForm onSuccess={handleSessionAdded} />
              )}
              {activeTab === "history" && (
                <div className="max-w-4xl mx-auto">
                  <div className="flex justify-between items-center mb-6">
                    <p className="text-muted-foreground font-medium">Manage and review your past training sessions.</p>
                  </div>
                  <SessionHistory sessions={sessions} onRefresh={refreshSessions} />
                </div>
              )}
              {activeTab === "tags" && (
                <TagManager onRefresh={refreshSessions} />
              )}
            </div>
          </main>

          {/* Mobile FAB - Only visible when not on the Log tab */}
          {activeTab !== "log" && (
            <div className="fixed bottom-6 right-6 md:hidden z-50">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="icon" 
                      className="h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-transform"
                      onClick={() => setActiveTab("log")}
                    >
                      <Plus className="h-6 w-6" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Log new session</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
