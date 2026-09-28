import {Button} from "@/components/ui/button";

export default function Home() {
    return (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
            <h1 className="text-3xl font-semibold tracking-tight">Interview Practice App</h1>
            <p className="text-muted-foreground">shadcn/ui check: these buttons should be styled.</p>
            <div className="flex flex-wrap gap-3">
                <Button>Default</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="ghost">Ghost</Button>
                <Button size="lg">Large</Button>
            </div>
        </main>
    );
}
