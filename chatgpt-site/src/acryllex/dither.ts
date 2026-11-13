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
