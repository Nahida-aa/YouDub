import appCss from '@repo/shared/styles/index.css?url';
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
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: 'Tauri + TanStack Start',
			},
		],
		links: [
			{
				rel: 'stylesheet',
				href: appCss,
			},
		],
		scripts: [{ children: themeScript }],
	}),

	component: RootComponent,
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<div class="antialiased">
				<Suspense>
					<ThemeProvider>
						<div class="p-2 flex gap-2 text-lg">
							<Link
								// @ts-expect-error
								to="/this-route-does-not-exist"
								activeProps={{
									class: 'font-bold',
								}}
							>
								This Route Does Not Exist
							</Link>
						</div>
						<Outlet />
					</ThemeProvider>
					<Devtools />
				</Suspense>
			</div>
		</>
	);
}
