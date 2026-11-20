//!PARAM YW_SHARPEN_LEVEL
//!TYPE int
//!MINIMUM 1
//!MAXIMUM 2
1

//!DESC Upscale sharpening
//!HOOK SCALED
//!BIND HOOKED

vec4 hook() {
    vec4 center = HOOKED_tex(HOOKED_pos);
    vec3 blur = 0.25 * (
        HOOKED_texOff(vec2(-1.5, 0.0)).rgb +
        HOOKED_texOff(vec2( 1.5, 0.0)).rgb +
        HOOKED_texOff(vec2(0.0, -1.5)).rgb +
        HOOKED_texOff(vec2(0.0,  1.5)).rgb
    );
    float detail = dot(center.rgb - blur, vec3(0.2126, 0.7152, 0.0722));
    bool strong = YW_SHARPEN_LEVEL == 2;
    float gain = strong ? 3.2 : 1.2;
    float limit = strong ? 0.14 : 0.065;
    // Suppress small variations and limit the bright and dark halos near strong edges.
    float boost = smoothstep(0.004, 0.025, abs(detail)) * clamp(gain * detail, -limit, limit);
    return vec4(center.rgb + vec3(boost), center.a);
}
