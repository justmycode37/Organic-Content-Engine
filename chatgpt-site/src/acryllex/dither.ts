/**
 * Change the ordered/random threshold mix without changing its expected tone curve.
 * A reference mix <= 1/65 has 64 non-overlapping uniform bands, so its inverse
 * distribution is analytic. Finite image patches can still change coverage;
 * compare their lighting and density against the source after changing grain.
 */
export const ditherThresholdGLSL=`
float mixedThresholdCDF(float t,float w){
 if(w>=.999999)return clamp(t,0.,1.);
 float a=(1.-w)/64.,x=(t-a*.5)/a,width=w/a;
 float n=clamp(ceil(x),0.,64.),m=clamp(floor(x-width)+1.,0.,64.);
 float partial=(n-m)*x-.5*(n*(n-1.)-m*(m-1.));
 return clamp((m+(a/w)*partial)/64.,0.,1.);
}
float referenceThreshold(float t,float w,float reference){
 if(abs(w-reference)<.000001)return t;
 float p=mixedThresholdCDF(t,max(w,.000001));
 float rank=min(63.,floor(p*64.)),u=clamp(p*64.-rank,0.,1.);
 return (1.-reference)*(rank+.5)/64.+reference*u;
}
`;

/** Permute complete threshold addresses; both ranks and static noise move together.
 * The selected reflection pairs cells in a 2x2 tile. A shared pair decision
 * either swaps both members or neither, preserving the tile's threshold multiset.
 * Geometry, source sampling and ink always keep their original coordinates.
 */
export const ditherActivityGLSL=`
vec2 activeThresholdCell(vec2 c,float amount,float epoch){
 if(amount<=0.)return c;
 vec2 tile=floor(c*.5),local=c-tile*2.;
 vec2 seed=tile+vec2(epoch*.731,epoch*.193);
 float direction=floor(hash(seed+vec2(17.31,43.71))*3.);
 vec2 partner=direction<1.?vec2(1.-local.x,local.y):direction<2.?vec2(local.x,1.-local.y):1.-local;
 float pairID=min(local.x+2.*local.y,partner.x+2.*partner.y);
 if(hash(seed+vec2(71.13+pairID*13.7,29.17+pairID*7.1))<amount)return tile*2.+partner;
 return c;
}
`;
