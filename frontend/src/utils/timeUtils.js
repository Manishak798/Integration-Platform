// @ts-nocheck
export const formatElapsedTime = (startTime) => {
    if (!startTime) return '';
    
    // Convert to UTC for both times
    const start = new Date(startTime + 'Z');  // Append Z to make it UTC
    const now = new Date();
    const utcNow = new Date(now.toISOString());
    
    const diff = Math.floor((utcNow - start) / 1000);    
    if (diff < 0) return '0s';
    
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    let result;
    if (hours > 0) {
        result = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        result = `${minutes}m ${seconds}s`;
    } else {
        result = `${seconds}s`;
    }

    return result;
}; 