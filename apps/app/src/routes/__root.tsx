// import appCss from '@repo/shared/styles/index.css?url';
import { Devtools } from '@repo/ui-solid/app/devtools';
import { ThemeProvider, themeScript } from '@repo/ui-solid/theme';
import type { QueryClient } from '@tanstack/solid-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
} from '@tanstack/solid-router';
import { type JSX, Suspense } from 'solid-js';

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		// links: [
		// 	{
		// 		rel: 'stylesheet',
		// 		href: appCss,
		// 	},
		// ],
		scripts: [{ children: themeScript }],
	}),

	component: RootComponent,
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<div class="antialiased min-h-dvh flex flex-col">
				<Suspense>
					<ThemeProvider>
						<header class="border-b border-border/60">
							<div class="mx-auto flex h-12 max-w-4xl items-center gap-4 px-4">
								<Link
									to="/"
									class="text-sm font-semibold hover:text-muted-foreground transition-colors"
									activeOptions={{ exact: true }}
								>
									YouDub
								</Link>
							</div>
						</header>
						<main class="flex-1">
							<Outlet />
						</main>
					</ThemeProvider>
					<Devtools />
				</Suspense>
			</div>
		</>
	);
}
