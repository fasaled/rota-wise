
# RotaWise - Doctor Scheduling Application

This is a Next.js application for fair and balanced doctor scheduling, built in Firebase Studio.

To get started with development, take a look at `src/app/page.tsx`.

## Development

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`.

3.  **For AI features (if implemented using Genkit):**
    Genkit is used for AI functionalities. The Genkit development server can be run alongside the Next.js dev server:
    ```bash
    npm run genkit:dev
    ```
    Or with watch mode:
    ```bash
    npm run genkit:watch
    ```
    Ensure you have any necessary API keys (e.g., for Google AI services) configured in your environment or a `.env.local` file. For example, Genkit's Google AI plugin typically looks for `GOOGLE_API_KEY`.

## Building for Production

To build the application for production, run:

```bash
npm run build
```

This will create an optimized production build in the `.next` folder.

## Preparing for Deployment (Outside Firebase)

If you plan to deploy this Next.js application to a platform other than Firebase App Hosting, follow these general guidelines:

1.  **Build the Project:**
    First, ensure you have a production build by running `npm run build`.

2.  **Environment Variables:**
    *   If your application uses AI features via Genkit or other services requiring API keys (like `GOOGLE_API_KEY` for the pre-configured Google AI plugin), ensure these environment variables are set in your deployment environment.
    *   Next.js also has built-in support for environment variables. You might use `.env.production` or configure them directly on your hosting platform.

3.  **Hosting Provider Configuration:**
    *   Choose a hosting provider that supports Node.js and Next.js applications (e.g., Vercel, Netlify, AWS Amplify, DigitalOcean App Platform, or your own server).
    *   Follow your hosting provider's specific instructions for deploying Next.js applications. This usually involves:
        *   Pointing the provider to your Git repository.
        *   Setting the build command (typically `npm run build` or `next build`).
        *   Setting the start command (typically `npm run start` or `next start -p $PORT`).
        *   Configuring any necessary environment variables.

4.  **Firebase-Specific Files:**
    *   The `apphosting.yaml` file is specific to Firebase App Hosting and will not be used by other hosting providers. You can safely ignore it or remove it if you are not deploying to Firebase.

5.  **Genkit Flows (if AI features are used):**
    *   If you have implemented Genkit flows, how they are deployed depends on their nature and your target environment. Genkit flows are typically Node.js functions.
    *   For serverless platforms, you might deploy them as individual functions.
    *   If running on a traditional server, they'll be part of your Next.js application's server-side code.
    *   Ensure that the Genkit configuration (`src/ai/genkit.ts`) and any flow definitions are compatible with your production environment and that the necessary AI models/plugins are accessible.

6.  **Server Configuration:**
    *   Most modern PaaS (Platform as a Service) providers for Next.js handle server configuration automatically.
    *   If deploying to your own server (e.g., using Docker or a bare metal server), you'll need to ensure Node.js is installed and configure a process manager (like PM2) to run the Next.js application using `npm run start`. You'll also likely need a reverse proxy (like Nginx or Apache) to handle incoming traffic and SSL termination.

Refer to the official Next.js deployment documentation and your chosen hosting provider's documentation for detailed instructions.
