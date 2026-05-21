import { getQueryClient } from '@repo/shared/integrations/tanstack-query/provider';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { createRouter, RouterProvider } from '@tanstack/solid-router';
import { render } from 'solid-js/web';
import { getRouter } from '#/router.tsx';
import '@repo/shared/styles/index.css'
// Create a new router instance
const router = getRouter();

const rootElement = document.getElementById('app')!;

if (!rootElement?.innerHTML) {
	render(
		() => (
			<QueryClientProvider client={getQueryClient()}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		),
		rootElement,
	);
}
