import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-container">
      <nav class="sidebar">
        <div class="logo">
          <span class="logo-icon">📋</span>
          <span class="logo-text">주간보고서</span>
        </div>
        <ul class="nav-list">
          <li>
            <a routerLink="/report" routerLinkActive="active" class="nav-item">
              <span class="nav-icon">📝</span>
              <span>보고서 생성</span>
            </a>
          </li>
          <li>
            <a
              routerLink="/settings"
              routerLinkActive="active"
              class="nav-item"
            >
              <span class="nav-icon">⚙️</span>
              <span>설정</span>
            </a>
          </li>
        </ul>
      </nav>
      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
      }
      .app-container {
        display: flex;
        height: 100%;
        background: #0f0f0f;
        color: #e0e0e0;
      }
      .sidebar {
        width: 220px;
        background: #1a1a2e;
        border-right: 1px solid #2a2a4a;
        display: flex;
        flex-direction: column;
        padding: 20px 0;
        flex-shrink: 0;
      }
      .logo {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 20px 24px;
        border-bottom: 1px solid #2a2a4a;
        margin-bottom: 16px;
      }
      .logo-icon {
        font-size: 24px;
      }
      .logo-text {
        font-size: 16px;
        font-weight: 700;
        background: linear-gradient(135deg, #667eea, #764ba2);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -0.5px;
      }
      .nav-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        text-decoration: none;
        color: #8888aa;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        border-left: 3px solid transparent;
      }
      .nav-item:hover {
        background: rgba(102, 126, 234, 0.08);
        color: #b0b0d0;
      }
      .nav-item.active {
        background: rgba(102, 126, 234, 0.12);
        color: #667eea;
        border-left-color: #667eea;
      }
      .nav-icon {
        font-size: 16px;
      }
      .main-content {
        flex: 1;
        overflow-y: auto;
        padding: 32px;
      }
    `,
  ],
})
export class App {}
