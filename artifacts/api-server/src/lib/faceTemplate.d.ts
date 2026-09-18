declare module "jpeg-js" {
  const jpeg: {
    decode(
      data: Buffer | Uint8Array,
      options?: { useTArray?: boolean },
    ): { data: Uint8Array; width: number; height: number };
  };
  export default jpeg;
}