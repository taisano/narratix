export * from './scene';
export { composeSlide, ComposeError, IMPLEMENTED_CHARTS } from './layout/compose';
export { fromDataset, type Matrix } from './transform/matrix';
export { applyTransforms } from './transform/ops';
export {
  IMPLEMENTED_TABLES, recipeRenderable, renderableRecipeIds, checkRecipeData, recipeIssueText,
  type RecipeIssue, type RecipeIssueCode, type RecipeCheck,
} from './recipes';
