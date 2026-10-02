import { ResultsView } from "@/components/results/results-view";

export default function ResultsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 print:max-w-none print:p-0">
      <ResultsView />
    </main>
  );
}
