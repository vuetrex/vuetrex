uniform float uTime;
uniform float uScale;
uniform vec3 uColor;

attribute vec3 velocity;
attribute vec2 minMax;
attribute float startTime;
attribute float size;
attribute float lifeTime;

varying vec4 vColor;
varying float lifeLeft;

void main() {

    vec3 pos;
    float timeElapsed = uTime - startTime;

    vColor = vec4( uColor, 1.0 );
    lifeLeft = 1.0 - ( timeElapsed / lifeTime );

    pos = position + velocity * timeElapsed;

    if (velocity.z > -0.0001 && velocity.z < 0.0001) {
        pos.x = clamp(pos.x, minMax.s, minMax.t);
        if (pos.x == minMax.s || pos.x == minMax.t) {
            timeElapsed = 0.0;
            gl_PointSize = 0.01;
        }
    } else {
        pos.z = clamp(pos.z, minMax.s, minMax.t);
        if (pos.z == minMax.s || pos.z == minMax.t) {
            timeElapsed = 0.0;
            gl_PointSize = 0.01;
        }
    }

    if( timeElapsed > 0.0 && lifeLeft > 0.0 ) {
        vec4 viewPosition = modelViewMatrix * vec4( pos, 1.0 );
        // Treat size as a world-space quantity. The reference distance keeps
        // today's appearance near the default camera, while a closer camera
        // naturally compensates for a proportionally downscaled diagram.
        float perspectiveScale = 12.0 / max(0.001, -viewPosition.z);
        gl_PointSize = 30.0 * uScale * size * lifeLeft * perspectiveScale;
        gl_Position = projectionMatrix * viewPosition;
    }
    else {
        gl_Position = projectionMatrix * modelViewMatrix * vec4( pos, 1.0 );
        lifeLeft = 0.0;
        gl_PointSize = 0.01;
    }
}
