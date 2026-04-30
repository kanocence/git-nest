export default defineAppConfig({
  icon: {
    // svg mode: icons are rendered inline by the server — no CSS layer conflicts
    // with Tailwind CSS v4, and icons load correctly during SSR.
    mode: 'svg',
  },
})
