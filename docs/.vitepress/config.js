/**
 * @type {import('vitepress').UserConfig}
 */
export default {
    lang: "en-US",
    title: 'Vuetrex',
    description: 'Reactive 3D diagrams built with Vue components',
    srcExclude: [
        'README.md',
        'container-layout-proposal.md',
        'superpowers/**',
    ],
    locales: {
        '/': {
            lang: 'en-US',
            title: 'Vuetrex',
            description: 'Reactive 3D diagrams built with Vue components'
        }
    },
    head: [
        ['link', {rel: 'icon', href: `/favicon.ico`}]
    ],
    markdown: {
        lineNumbers: true
    },
    vue: {
        template: {
            compilerOptions: {
                isCustomElement: tag => tag.startsWith('vx-')
            }
        }
    },
    themeConfig: {
        logo: '/logo.png',
        socialLinks: [
            {icon: 'github', link: 'https://github.com/exceeder/vuetrex'}
        ],
        editLink: {
            pattern: 'https://github.com/exceeder/vuetrex/edit/main/docs/:path',
            text: 'Edit this page on GitHub'
        },
        search: { provider: 'local' },

        nav: [
            {text: 'Guide', link: '/guide/'},
            {text: 'Composition', link: '/guide/composability'},
            {text: 'API', link: '/api/'},
            {text: 'Release Notes', link: 'https://github.com/exceeder/vuetrex/releases'},
        ],

        sidebar: [
            {
                text: 'Learn Vuetrex',
                items: [
                    {text: 'Start with a scene', link: '/guide/'},
                    {text: 'Live data and components', link: '/guide/live-data'},
                    {text: 'Layout in 3D', link: '/guide/layouts'},
                    {text: 'Connections and focus', link: '/guide/connections-and-focus'},
                    {text: 'Composition recipes', link: '/guide/composability'},
                    {text: 'Large scenes', link: '/guide/large-scenes'},
                    {text: 'Display walls', link: '/guide/display-walls'},
                    {text: 'Procedural geometry', link: '/guide/procedural-geometry'}
                ]
            },
            {
                text: 'Reference',
                items: [
                    {text: 'Components and props', link: '/api/'},
                    {text: 'Stage API', link: '/api/stage'},
                    {text: 'Composition API', link: '/api/composition'},
                    {text: 'Architecture', link: '/architecture'},
                ]
            }
        ],
        outline: { level: [2, 3] }
    }
}
