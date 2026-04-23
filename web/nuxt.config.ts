import process from 'node:process'
import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants/index'

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
  ],

  devtools: {
    enabled: true,
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/nuxt.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#222222' },
      ],
    },
  },

  css: [
    '~/assets/styles/variables.css',
  ],

  colorMode: {
    classSuffix: '',
  },

  runtimeConfig: {
    gitRunnerHost: process.env.GIT_RUNNER_HOST || 'localhost',
    gitRunnerPort: process.env.GIT_RUNNER_PORT || '3001',
    gitRunnerSecret: process.env.GIT_RUNNER_SECRET || '',
    agentHost: process.env.NUXT_AGENT_HOST || 'localhost',
    agentPort: process.env.NUXT_AGENT_PORT || '3002',
    agentSecret: process.env.NUXT_AGENT_SECRET || '',
    webPassword: process.env.WEB_PASSWORD || '',
    public: {
      codeServerUrl: process.env.NUXT_PUBLIC_CODE_SERVER_URL || '',
      serverHost: process.env.NUXT_PUBLIC_SERVER_HOST || '',
      sshHost: process.env.NUXT_PUBLIC_SSH_HOST || '',
      sshPort: Number(process.env.NUXT_PUBLIC_SSH_PORT || 22),
      sshGitPath: process.env.NUXT_PUBLIC_SSH_GIT_PATH || './data/git',
    },
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      routes: [],
    },
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  pwa,
})
