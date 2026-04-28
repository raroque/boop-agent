// Convex Auth provider config — single password provider, single user.
// See https://labs.convex.dev/auth for full docs.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
