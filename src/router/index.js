import { createRouter, createWebHistory } from 'vue-router'
import PublicPage from '../views/PublicPage.vue'
import PlayerPage from '../views/PlayerPage.vue'
import AdminPage from '../views/AdminPage.vue'

const routes = [
  { path: '/', component: PublicPage },
  { path: '/jugar', component: PlayerPage },
  { path: '/admin', component: AdminPage },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
