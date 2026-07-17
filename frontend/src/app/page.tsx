import Player from "@/components/Player";
import Comments, { ChatOverlay, MobileChatBar } from "@/components/Comments";
import ContentView from "@/components/ContentView";
import { FloatingReactions, ReactionDock } from "@/components/Reactions";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-2 sm:px-6 sm:py-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="min-w-0">
          <div className="relative -mx-3 sm:mx-0">
            <Player />
            <ChatOverlay className="lg:hidden" />
            <FloatingReactions />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <ReactionDock />
            <p className="hidden text-xs text-muted sm:block">
              Реакции видят все - жмите, не стесняйтесь
            </p>
          </div>
          <MobileChatBar className="mt-2 lg:hidden" />
        </div>

        <div className="relative hidden lg:block">
          <Comments className="absolute inset-0 flex" />
        </div>

        <div className="mt-2 min-w-0 sm:mt-4 lg:col-start-1">
          <ContentView />
        </div>
      </div>
    </div>
  );
}
