/**
 * v13-fullscreen-fix.js
 * Fixes menu viewport positioning during fullscreen transitions
 * Issue: Menus rendered outside visible area after fullscreen toggle
 * Solution: Recalculate menu positions based on actual viewport dimensions
 */

(function() {
    'use strict';
    
    if (!window.GameConfig) window.GameConfig = {};
    if (!window.GameUI) window.GameUI = {};
    
    // Store original renderMenuOverlay if it exists
    const OriginalRenderMenu = window.GameUI.renderMenuOverlay || function() {};
    
    // Override renderMenuOverlay to handle fullscreen viewport changes
    window.GameUI.renderMenuOverlay = function(ctx, menu, camera) {
        if (!menu || !ctx) return;
        
        // Get current canvas/viewport dimensions
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return;
        
        const viewportWidth = canvas.clientWidth || canvas.width;
        const viewportHeight = canvas.clientHeight || canvas.height;
        
        // Store viewport info for menu positioning
        const viewport = {
            width: viewportWidth,
            height: viewportHeight,
            centerX: viewportWidth / 2,
            centerY: viewportHeight / 2
        };
        
        // Call original with viewport context
        if (typeof OriginalRenderMenu === 'function') {
            OriginalRenderMenu.call(this, ctx, menu, camera);
        }
        
        // Reposition menu items if they're outside viewport bounds
        if (menu.items && Array.isArray(menu.items)) {
            menu.items.forEach(item => {
                if (item.x !== undefined && item.y !== undefined) {
                    // Clamp menu positions to viewport
                    const itemWidth = item.width || 200;
                    const itemHeight = item.height || 40;
                    
                    // Ensure menu stays within bounds
                    if (item.x + itemWidth > viewportWidth) {
                        item.x = viewportWidth - itemWidth - 20;
                    }
                    if (item.x < 20) {
                        item.x = 20;
                    }
                    if (item.y + itemHeight > viewportHeight) {
                        item.y = viewportHeight - itemHeight - 20;
                    }
                    if (item.y < 20) {
                        item.y = 20;
                    }
                }
            });
        }
    };
    
    // Listen for fullscreen changes and recalculate menu positions
    document.addEventListener('fullscreenchange', function() {
        if (window.GameState) {
            // Trigger menu recalculation after fullscreen toggle
            setTimeout(() => {
                const canvas = document.getElementById('gameCanvas');
                if (canvas) {
                    // Dispatch custom event for menu repositioning
                    canvas.dispatchEvent(new CustomEvent('viewportchange', {
                        detail: {
                            width: canvas.clientWidth || canvas.width,
                            height: canvas.clientHeight || canvas.height
                        }
                    }));
                }
            }, 100);
        }
    }, false);
    
    // Fallback for browsers that use webkit prefix
    document.addEventListener('webkitfullscreenchange', function() {
        if (window.GameState) {
            setTimeout(() => {
                const canvas = document.getElementById('gameCanvas');
                if (canvas) {
                    canvas.dispatchEvent(new CustomEvent('viewportchange', {
                        detail: {
                            width: canvas.clientWidth || canvas.width,
                            height: canvas.clientHeight || canvas.height
                        }
                    }));
                }
            }, 100);
        }
    }, false);
    
    // Handle window resize events (also happens during fullscreen transitions)
    window.addEventListener('resize', function() {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.dispatchEvent(new CustomEvent('viewportchange', {
                detail: {
                    width: canvas.clientWidth || canvas.width,
                    height: canvas.clientHeight || canvas.height
                }
            }));
        }
    }, false);
    
    // Export viewport fix utilities
    window.GameUI.getViewportBounds = function() {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) {
            return {
                width: window.innerWidth,
                height: window.innerHeight,
                centerX: window.innerWidth / 2,
                centerY: window.innerHeight / 2
            };
        }
        return {
            width: canvas.clientWidth || canvas.width,
            height: canvas.clientHeight || canvas.height,
            centerX: (canvas.clientWidth || canvas.width) / 2,
            centerY: (canvas.clientHeight || canvas.height) / 2
        };
    };
    
    // Clamp position helper for menu items
    window.GameUI.clampMenuPosition = function(x, y, itemWidth, itemHeight) {
        const bounds = window.GameUI.getViewportBounds();
        const padding = 20;
        
        return {
            x: Math.max(padding, Math.min(x, bounds.width - itemWidth - padding)),
            y: Math.max(padding, Math.min(y, bounds.height - itemHeight - padding))
        };
    };
    
})();
