# Klein Bottle VR — Weave Realm Studio

> 克莱因瓶 · 现实与虚拟互相交织 | Klein Bottle · Reality & Virtual Interweaving

Pico 4 WebVR Deployment Guide

---

## 目录

1. [项目概述](#项目概述)
2. [本地调试 (Python)](#本地调试-python)
3. [GitHub Pages 部署](#github-pages-部署)
4. [Nginx 服务器部署](#nginx-服务器部署)
5. [Pico 4 操作指南](#pico-4-操作指南)
6. [性能优化建议](#性能优化建议)
7. [常见问题排查](#常见问题排查)

---

## 项目概述

- **技术栈**: Three.js r182 + WebXR + GLSL ES 3.0
- **目标设备**: Pico 4 / Pico Neo 3 / 其他 WebXR 兼容头显
- **核心功能**: 克莱因瓶参数化曲面 + 交互式擦拭效果 + WebXR 沉浸体验
- **品牌配色**: Weave Realm Studio 织境数字品牌色系

### 性能基准

| 场景 | 粒子数 | 分辨率 | 帧率 |
|------|--------|--------|------|
| 桌面调试 | 2000 | 1080p | 60fps |
| Pico 4 原生 | 2000 | 双眼 1832×1920 | 72fps |
| 移动热点 | 1000 | 1832×1920 | 60fps |

---

## 本地调试 (Python)

适合：**桌面浏览器开发调试**，或手机开热点直连 Pico 4

```bash
# 进入项目目录
cd /Users/xxx/CodeBuddy/webvrtest

# 启动本地 HTTP 服务器 (Python 3)
python3 -m http.server 8080

# 或使用 PHP
php -S localhost:8080
```

然后用桌面浏览器打开: http://localhost:8080

**桌面调试功能**:
- 🖱️ 鼠标移动 → 控制擦拭位置
- 🖱️ 按住左键 → 触发动态擦拭
- `R` 键 → 重置擦拭轨迹
- `Enter` → 尝试进入 VR 模式

---

## GitHub Pages 部署

适合：**公网访问、演示、快捷发布**

### 部署步骤

```bash
# 1. 进入项目目录
cd /Users/xxx/CodeBuddy/webvrtest

# 2. 初始化 Git (如果还没初始化)
git init
git add .
git commit -m "Klein Bottle VR initial commit"

# 3. 创建 GitHub 仓库并推送
git remote add origin https://github.com/YOUR_USERNAME/klein-bottle-vr.git
git branch -M main
git push -u origin main

# 4. 在 GitHub 仓库 Settings → Pages → Source: main / (root)
# 5. 等待 2-3 分钟部署完成
# 6. 访问 https://YOUR_USERNAME.github.io/klein-bottle-vr/
```

> **注意**: GitHub Pages 部署后，建议在桌面浏览器测试 VR 功能正常后再用 Pico 4 访问。

---

## Nginx 服务器部署

适合：**已有云服务器的生产环境**

### 部署到现有服务器

```bash
# 1. SCP 上传文件到服务器
scp -r /Users/xxx/CodeBuddy/webvrtest/* root@YOUR_SERVER_IP:/var/www/klein-bottle/

# 2. SSH 登录服务器后，创建 Nginx 配置
sudo nano /etc/nginx/sites-available/klein-bottle
```

**Nginx 配置内容**:
```nginx
server {
    listen 80;
    server_name klein-vr.yourdomain.com;

    root /var/www/klein-bottle;
    index index.html;

    # MIME 类型 (关键!)
    types {
        module *;  # For ES modules (.js with import/export)
        application/javascript js mjs;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 禁用缓存 (开发调试用)
    location ~* \.(js|mjs)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        expires 0;
    }

    # CORS headers (如果跨域)
    location ~* \.(js|mjs)$ {
        add_header Access-Control-Allow-Origin "*";
        add_header Cache-Control "no-cache";
    }
}
```

```bash
# 3. 启用配置并重载 Nginx
sudo ln -s /etc/nginx/sites-available/klein-bottle /etc/nginx/sites-enabled/
sudo nginx -t
sudo nginx -s reload

# 4. HTTPS (Let's Encrypt)
sudo certbot --nginx -d klein-vr.yourdomain.com
```

### 在 Pico 4 上访问

确保 **手机和服务器在同一局域网**，或服务器有公网 IP:

```
http://YOUR_SERVER_IP/klein-bottle/
```

---

## Pico 4 操作指南

### 首次设置

1. **开发者模式**: 设置 → 通用 → USB → 开发者模式 开启
2. **网络**: 连接手机热点或同一 WiFi
3. **浏览器**: Pico 浏览器 (原生) 或 Chrome (如果已安装)

### 访问步骤

| 步骤 | 操作 |
|------|------|
| 1 | Pico 4 打开浏览器 |
| 2 | 输入服务器地址 (如 `http://81.71.153.194/klein-bottle/`) |
| 3 | 等待加载完成，点击 **"ENTER VR"** |
| 4 | 戴上头显，进入 VR 世界 |

### VR 内交互

| 控制器 | 功能 |
|--------|------|
| 🤚 任一扳机键 | 按住擦拭克莱因瓶表面 |
| 🔄 移动手柄 | 改变擦拭位置 |
| ⏹️ 松开扳机 | 停止擦拭，轨迹持久化 |
| 🔙 Home 键 | 退出 VR |

### 桌面端备用控制

如果 VR 内手柄操控困难，可用桌面浏览器调试后直接在 Pico 浏览器测试。

---

## 性能优化建议

### 立即可用的优化

1. **粒子数降级** (移动端): 编辑 `KleinScene.js` 第 47 行
   ```javascript
   const particleCount = navigator.xr ? 1000 : 2000;
   ```

2. **渲染分辨率缩放**
   ```javascript
   renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // 降为1.5x
   ```

3. **禁用雾效** (Pico 4 性能敏感)
   ```javascript
   scene.fog = null; // 注释掉 FogExp2
   ```

4. **帧率锁定** (省电)
   ```javascript
   renderer.setAnimationLoop(...) // 默认 72fps on Pico
   ```

### 着色器优化

- 减少 `flowNoise` 中的倍频数 (当前 4 层，可降至 3 层)
- 降低 `kleinBottle` 细分: `new THREE.SphereGeometry(1.2, 64, 64)` → `32, 32`

---

## 常见问题排查

### Q1: Pico 4 浏览器显示 "WebXR 不可用"

**原因**: Pico 4 原生浏览器 WebXR 支持有限

**解决方案**:
1. 确保在 VR 会话中才调用 `navigator.xr.requestSession('immersive-vr')`
2. 或安装 [WebXR Viewer](https://play.google.com/store/apps/details?id=com.mozilla.webxr) (Pico 支持度更好)
3. 使用桌面 Chrome + USB 调试: `adb forward tcp:8080 tcp:8080`

### Q2: 画面撕裂 / 帧率低

**解决方案**:
```javascript
// 在 KleinScene.js 的 renderer 初始化后添加:
renderer.forcePowerPreference = 'high-performance';
renderer.logarithmicDepthBuffer = true;
```

### Q3: 触摸擦拭无反应

**排查步骤**:
1. 检查 `touchmove` 事件的 `e.preventDefault()` 是否被注释
2. 确认 `isWiping` 标志位在 `_onSelectStart` 中被正确设置
3. 桌面端测试: `mousedown/mousemove/mouseup` 是否正常工作

### Q4: GitHub Pages 加载后黑屏

**原因**: ES Module import 跨域问题

**解决方案**:
- 确保 CDN URL 使用 `https://cdn.jsdelivr.net` (不行则用 `unpkg.com`)
- 检查浏览器控制台 Network 标签是否有 `ERR_BLOCKED_BY_CORS`
- 或在 GitHub 仓库 Settings → Pages → 添加 `CUSTOM HEADERS`:
  ```html
  <meta http-equiv="..."
  ```

---

## 项目文件结构

```
/Users/xxx/CodeBuddy/webvrtest/
├── index.html         # 主入口页面
├── KleinShader.js     # GLSL 着色器 (顶点+片段)
├── KleinScene.js      # Three.js 场景管理
├── KleinVessel.js     # 核心交互组件
├── main.js            # 应用入口 + WebXR 会话
└── README.md          # 本文档
```

---

*织境数字 Weave Realm Studio · Klein Bottle VR · 2026*
